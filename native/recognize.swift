import Foundation
import Vision
import ImageIO
import CoreGraphics
import CoreText

struct Region: Decodable { let id: String; let x: Double; let y: Double; let width: Double; let height: Double }
struct Word: Encodable { let text: String; let confidence: Float; let x: Double; let y: Double; let width: Double; let height: Double }
struct Reading: Encodable { let id: String; let words: [Word] }
// A face-up card found by its shape and corner index. Coordinates are fractions of the frame.
// `group` identifies the light card area it was found in (overlapping cards share one).
struct Card: Encodable {
    let rank: String; let suit: String; let confidence: Float
    let x: Double; let y: Double; let width: Double; let height: Double
    let group: Int; let gx: Double; let gy: Double; let gw: Double; let gh: Double
}
struct Output: Encodable { let width: Int; let height: Int; let readings: [Reading]; let cards: [Card]? }

func recognize(_ image: CGImage, fast: Bool = false) throws -> [VNRecognizedTextObservation] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = fast ? .fast : .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    request.minimumTextHeight = 0.008
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    return request.results ?? []
}

let debug = ProcessInfo.processInfo.environment["RIVER_DEBUG"] != nil
func log(_ s: String) { if debug { FileHandle.standardError.write(Data((s + "\n").utf8)) } }

// MARK: - Pixels

final class Pixels {
    let w: Int, h: Int
    let data: [UInt8]
    init?(_ image: CGImage) {
        let w = image.width, h = image.height
        var buffer = [UInt8](repeating: 0, count: w * h * 4)
        let ok = buffer.withUnsafeMutableBytes { raw -> Bool in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        self.w = w; self.h = h; self.data = buffer
    }
    @inline(__always) func rgb(_ x: Int, _ y: Int) -> (Int, Int, Int) {
        let i = (y * w + x) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }
    // Card faces are white or cream: bright and nearly colourless.
    @inline(__always) func face(_ x: Int, _ y: Int) -> Bool {
        let (r, g, b) = rgb(x, y)
        let mn = min(r, g, b), mx = max(r, g, b)
        return mn > 190 && mx - mn < 48
    }
    // Index ink: dark, or strongly coloured (red, blue or green four-colour suits).
    @inline(__always) func ink(_ x: Int, _ y: Int) -> Bool {
        let (r, g, b) = rgb(x, y)
        let mn = min(r, g, b), mx = max(r, g, b)
        return (r + g + b) / 3 < 140 || (mx - mn > 90 && mx > 110)
    }
}

struct Box { var x0: Int; var y0: Int; var x1: Int; var y1: Int; var count: Int
    var w: Int { x1 - x0 + 1 }; var h: Int { y1 - y0 + 1 }
}

// 4-connected components of `test` inside a window, sampled every `step` pixels.
func components(_ px: Pixels, x0: Int, y0: Int, x1: Int, y1: Int, step: Int, test: (Int, Int) -> Bool) -> ([Box], [Int32], Int, Int) {
    let gw = max(1, (x1 - x0) / step), gh = max(1, (y1 - y0) / step)
    var labels = [Int32](repeating: -1, count: gw * gh)
    var mask = [Bool](repeating: false, count: gw * gh)
    for gy in 0..<gh { for gx in 0..<gw { mask[gy * gw + gx] = test(x0 + gx * step, y0 + gy * step) } }
    var boxes: [Box] = []
    var stack: [Int] = []
    for start in 0..<(gw * gh) where mask[start] && labels[start] < 0 {
        let id = Int32(boxes.count)
        var b = Box(x0: Int.max, y0: Int.max, x1: -1, y1: -1, count: 0)
        stack.append(start); labels[start] = id
        while let i = stack.popLast() {
            let gx = i % gw, gy = i / gw
            b.x0 = min(b.x0, gx); b.x1 = max(b.x1, gx); b.y0 = min(b.y0, gy); b.y1 = max(b.y1, gy); b.count += 1
            if gx > 0, mask[i - 1], labels[i - 1] < 0 { labels[i - 1] = id; stack.append(i - 1) }
            if gx < gw - 1, mask[i + 1], labels[i + 1] < 0 { labels[i + 1] = id; stack.append(i + 1) }
            if gy > 0, mask[i - gw], labels[i - gw] < 0 { labels[i - gw] = id; stack.append(i - gw) }
            if gy < gh - 1, mask[i + gw], labels[i + gw] < 0 { labels[i + gw] = id; stack.append(i + gw) }
        }
        boxes.append(b)
    }
    return (boxes, labels, gw, gh)
}

// MARK: - Suit shapes

let suitCodes: [(Character, String)] = [("♠", "s"), ("♥", "h"), ("♦", "d"), ("♣", "c")]
let N = 24
func normalise(_ inside: (Int, Int) -> Bool, w: Int, h: Int) -> [Bool] {
    var out = [Bool](repeating: false, count: N * N)
    for y in 0..<N { for x in 0..<N {
        out[y * N + x] = inside(min(w - 1, (x * w + w / 2) / N), min(h - 1, (y * h + h / 2) / N))
    } }
    return out
}
// Reference masks rendered from common fonts. Matching uses overlap of normalised shapes.
func renderMasks(_ items: [(String, String)], fonts: [String]) -> [(String, [Bool])] {
    var out: [(String, [Bool])] = []
    let size = 160
    for name in fonts {
        let font = CTFontCreateWithName(name as CFString, 72, nil)
        for (text, code) in items {
            var gray = [UInt8](repeating: 0, count: size * size)
            gray.withUnsafeMutableBytes { raw in
                guard let ctx = CGContext(data: raw.baseAddress, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size,
                                          space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }
                ctx.setFillColor(gray: 0, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
                let attr = NSAttributedString(string: text, attributes: [
                    NSAttributedString.Key(kCTFontAttributeName as String): font,
                    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1),
                ])
                ctx.textPosition = CGPoint(x: 10, y: 30)
                CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
            }
            var x0 = size, y0 = size, x1 = -1, y1 = -1
            for y in 0..<size { for x in 0..<size where gray[y * size + x] > 127 {
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
            } }
            guard x1 > x0 + 2, y1 > y0 + 4 else { continue }
            out.append((code, normalise({ gray[(y0 + $1) * size + x0 + $0] > 127 }, w: x1 - x0 + 1, h: y1 - y0 + 1)))
        }
    }
    return out
}
let templates = renderMasks(suitCodes.map { (String($0.0), $0.1) },
    fonts: ["Helvetica", "Arial", "Apple Symbols", "Menlo", "Times New Roman", "Georgia", "Verdana", "Arial Unicode MS", "Lucida Grande"])
let rankTemplates = renderMasks(
    [("A", "A"), ("K", "K"), ("Q", "Q"), ("J", "J"), ("10", "T"), ("9", "9"), ("8", "8"), ("7", "7"), ("6", "6"), ("5", "5"), ("4", "4"), ("3", "3"), ("2", "2")],
    fonts: ["Helvetica", "Helvetica-Bold", "Arial", "Arial-BoldMT", "Georgia", "Georgia-Bold", "Times New Roman", "TimesNewRomanPS-BoldMT",
            "Verdana", "Verdana-Bold", "Menlo-Regular", "Menlo-Bold", "Courier New", "Futura-Medium", "AvenirNext-Bold", "AvenirNext-Regular",
            "Trebuchet MS", "Tahoma", "Palatino-Roman", "Palatino-Bold", ".AppleSystemUIFont", "SFProDisplay-Bold"])
// Width of the top rows relative to the widest row: a spade or diamond starts at a point,
// a club or heart starts with rounded lobes.
func topRatio(_ m: [Bool]) -> Double {
    var widths: [Int] = []
    for y in 0..<N {
        var x0 = N, x1 = -1
        for x in 0..<N where m[y * N + x] { x0 = min(x0, x); x1 = max(x1, x) }
        widths.append(x1 >= x0 ? x1 - x0 + 1 : 0)
    }
    let maxW = Double(widths.max() ?? 1)
    let rows = widths.enumerated().filter { $0.element > 0 }.map { $0.offset }
    guard let first = rows.first, maxW > 0 else { return 0 }
    let top = widths[first..<min(N, first + 3)]
    return Double(top.reduce(0, +)) / Double(top.count) / maxW
}
func overlap(_ a: [Bool], _ b: [Bool]) -> Double {
    var both = 0, either = 0
    for i in 0..<a.count { if a[i] && b[i] { both += 1 }; if a[i] || b[i] { either += 1 } }
    return either == 0 ? 0 : Double(both) / Double(either)
}

// MARK: - Cards

func rankTokens(_ s: String) -> [String] {
    var out: [String] = []
    let chars = Array(s.uppercased().filter { !$0.isWhitespace })
    var i = 0
    while i < chars.count {
        let c = chars[i]
        if "1IL|".contains(c), i + 1 < chars.count, "0O".contains(chars[i + 1]) { out.append("T"); i += 2; continue }
        if "AKQJ23456789".contains(c) { out.append(String(c)) }
        i += 1
    }
    return out
}

// Classify one ink component: colour narrows the suits, shape decides.
func classifySuit(_ px: Pixels, _ comp: Box, _ labels: [Int32], _ gw: Int, _ id: Int32, ox: Int, oy: Int) -> (String, Double)? {
    var red = 0, blue = 0, green = 0, all = 0
    for y in comp.y0...comp.y1 { for x in comp.x0...comp.x1 where labels[y * gw + x] == id {
        let (r, g, b) = px.rgb(ox + x, oy + y)
        all += 1
        if r - max(g, b) > 50 { red += 1 } else if b - max(r, g) > 35 { blue += 1 } else if g - max(r, b) > 35 { green += 1 }
    } }
    guard all > 0 else { return nil }
    let shape = normalise({ labels[(comp.y0 + $1) * gw + comp.x0 + $0] == id }, w: comp.w, h: comp.h)
    let allowed: Set<String> = blue * 2 > all ? ["d"] : green * 2 > all ? ["c"] : red * 2 > all ? ["h", "d"] : ["s", "c"]
    var best: [String: Double] = [:]
    for (code, t) in templates where allowed.contains(code) { best[code] = max(best[code] ?? 0, overlap(shape, t)) }
    guard let top = best.max(by: { $0.value < $1.value }), top.value > 0.42 else { return nil }
    if allowed.count == 1 { return (top.key, max(top.value, 0.9)) }
    // The top of the shape separates the pairs that colour leaves open: a spade or diamond
    // starts at a point, a club or heart with rounded lobes. Measured 0.10-0.21 vs 0.26-0.86.
    let ratio = topRatio(shape)
    log("     suit scores \(best.map { "\($0.key) \(String(format: "%.2f", $0.value))" }.sorted()) top \(String(format: "%.2f", ratio))")
    let pointed = allowed.contains("s") ? "s" : "d", rounded = allowed.contains("s") ? "c" : "h"
    let cut: (Double, Double) = allowed.contains("s") ? (0.21, 0.25) : (0.4, 0.55)
    if ratio <= cut.0 { return (pointed, best[pointed] ?? top.value) }
    if ratio >= cut.1 { return (rounded, best[rounded] ?? top.value) }
    return top
}

// Read one rank from its isolated shape: Vision on a clean enlarged copy, checked against
// rank shapes rendered from common fonts. Either source alone needs a clear result.
func readRank(_ mask: (Int, Int) -> Bool, w: Int, h: Int) -> (String, Float)? {
    let shape = normalise(mask, w: w, h: h)
    var scores: [String: Double] = [:]
    for (code, t) in rankTemplates { scores[code] = max(scores[code] ?? 0, overlap(shape, t)) }
    let ranked = scores.sorted { $0.value > $1.value }
    let scale = max(1, 110 / max(1, h)), pad = 30
    let cw = w * scale + pad * 2, ch = h * scale + pad * 2
    var pixels = [UInt8](repeating: 255, count: cw * ch)
    for y in 0..<(h * scale) { for x in 0..<(w * scale) where mask(x / scale, y / scale) { pixels[(y + pad) * cw + x + pad] = 0 } }
    var vision: (String, Float)? = nil
    let provider = CGDataProvider(data: Data(pixels) as CFData)!
    if let img = CGImage(width: cw, height: ch, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: cw, space: CGColorSpaceCreateDeviceGray(),
                         bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
       let observations = try? recognize(img) {
        for o in observations { if let c = o.topCandidates(1).first, rankTokens(c.string).count == 1 { vision = (rankTokens(c.string)[0], c.confidence); break } }
    }
    let top = ranked.first, second = ranked.dropFirst().first?.value ?? 0
    log("     rank vision \(String(describing: vision)) shape \(top.map { "\($0.key) \(String(format: "%.2f", $0.value))" } ?? "-") next \(String(format: "%.2f", second))")
    if let v = vision {
        if let t = top, t.key != v.0, t.value > 0.78, (scores[v.0] ?? 0) < t.value - 0.15 { return nil }
        return v
    }
    if let t = top, t.value >= 0.6, t.value - second >= 0.05 { return (t.key, Float(t.value)) }
    return nil
}


func detectCards(_ image: CGImage) -> [Card] {
    guard let px = Pixels(image) else { return [] }
    let W = Double(px.w), H = Double(px.h)
    let step = max(1, px.w / 1400)
    let (blobs, _, _, _) = components(px, x0: 0, y0: 0, x1: px.w - 1, y1: px.h - 1, step: step) { px.face($0, $1) }
    var cards: [Card] = []
    var group = 0
    for blob in blobs {
        let bx = blob.x0 * step, by = blob.y0 * step, bw = blob.w * step, bh = blob.h * step
        let fill = Double(blob.count) / Double(blob.w * blob.h)
        let aspect = Double(bh) / Double(max(1, bw))
        guard Double(bh) >= 0.025 * H, Double(bh) <= 0.42 * H, Double(bw) >= 0.008 * W,
              aspect >= 0.3, aspect <= 3.6, fill >= 0.3 else { continue }
        log("blob \(bx),\(by) \(bw)x\(bh) fill \(String(format: "%.2f", fill))")
        // Ink shapes in the upper part of the card area: corner indices live here.
        let top = Int(Double(bh) * 0.55)
        let (inks, labels, gw, _) = components(px, x0: bx, y0: by, x1: bx + bw - 1, y1: by + top, step: 1) { px.ink($0, $1) }
        let minH = Int(Double(bh) * 0.07), maxH = Int(Double(bh) * 0.36)
        var glyphs = inks.enumerated().filter { _, k in k.h >= minH && k.h <= maxH && k.w <= maxH * 2 && k.count >= 10 && k.x0 > 0 && k.x1 < gw - 1 }
        // Join side-by-side parts of one rank, such as "1" and "0".
        var merged: [(Box, [Int])] = []
        for (i, k) in glyphs.sorted(by: { $0.1.x0 < $1.1.x0 }) {
            if let j = merged.indices.last(where: { m in
                let b = merged[m].0
                return abs(b.y0 - k.y0) < max(3, k.h / 5) && abs(b.h - k.h) < max(3, k.h / 4) && k.x0 - b.x1 < max(3, k.h * 2 / 5) && k.x0 > b.x0
            }) {
                var b = merged[j].0
                b.x0 = min(b.x0, k.x0); b.x1 = max(b.x1, k.x1); b.y0 = min(b.y0, k.y0); b.y1 = max(b.y1, k.y1); b.count += k.count
                merged[j] = (b, merged[j].1 + [i])
            } else { merged.append((k, [i])) }
        }
        glyphs = []
        var found: [Card] = []
        for (rankBox, parts) in merged {
            let h = rankBox.h
            if aspect >= 1.15, Double(rankBox.x0 + rankBox.x1) / 2 > Double(bw) * 0.5 { continue }
            // Suit: the nearest shape directly below, or immediately to the right.
            var best: (Int, Box, Int)? = nil
            for (j, k) in inks.enumerated() where !parts.contains(j) {
                guard k.h >= max(3, h * 3 / 10), k.h <= h * 17 / 10, k.w >= max(3, h * 3 / 10), k.w <= h * 2, k.count >= 8 else { continue }
                let below = k.y0 >= rankBox.y1 - h / 6 && k.y0 - rankBox.y1 <= h * 7 / 10 &&
                    abs((k.x0 + k.x1) / 2 - (rankBox.x0 + rankBox.x1) / 2) <= max(h * 6 / 10, rankBox.w / 2)
                let beside = k.x0 >= rankBox.x1 - h / 8 && k.x0 - rankBox.x1 <= h * 6 / 10 &&
                    k.y0 < rankBox.y1 && k.y1 > rankBox.y0
                guard below || beside else { continue }
                let gap = below ? k.y0 - rankBox.y1 : k.x0 - rankBox.x1
                if best == nil || gap < best!.2 { best = (j, k, gap) }
            }
            guard let (sid, sbox, _) = best,
                  let (code, shape) = classifySuit(px, sbox, labels, gw, Int32(sid), ox: bx, oy: by) else { continue }
            let rect = CGRect(x: bx + rankBox.x0, y: by + rankBox.y0, width: rankBox.w, height: rankBox.h)
            let partIds = Set(parts.map { Int32($0) })
            guard let (rank, conf) = readRank({ partIds.contains(labels[(rankBox.y0 + $1) * gw + rankBox.x0 + $0]) }, w: rankBox.w, h: rankBox.h) else {
                log("   glyph at \(Int(rect.minX)),\(Int(rect.minY)) h\(h) suit \(code) — rank unread")
                continue
            }
            log("   card \(rank)\(code) at \(Int(rect.minX)),\(Int(rect.minY)) h\(h) shape \(String(format: "%.2f", shape))")
            if found.contains(where: { $0.rank == rank && $0.suit == code }) { continue }
            found.append(Card(rank: rank, suit: code, confidence: conf * Float(min(1, shape + 0.25)),
                              x: Double(rect.minX) / W, y: Double(rect.minY) / H, width: Double(rect.width) / W, height: Double(rect.height) / H,
                              group: group, gx: Double(bx) / W, gy: Double(by) / H, gw: Double(bw) / W, gh: Double(bh) / H))
        }
        if !found.isEmpty { cards.append(contentsOf: found.sorted { $0.x < $1.x }); group += 1 }
    }
    return cards
}

// MARK: - Main

// `river-ocr --templates` prints the reference shapes so other platforms match identically.
if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--templates" {
    let bits = { (m: [Bool]) in String(m.map { $0 ? "1" : "0" }) }
    let json: [String: Any] = [
        "size": N,
        "suits": templates.map { ["code": $0.0, "mask": bits($0.1)] },
        "ranks": rankTemplates.map { ["code": $0.0, "mask": bits($0.1)] },
    ]
    FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: json))
    exit(0)
}
do {
    let args = CommandLine.arguments
    guard args.count == 3 || (args.count == 4 && args[3] == "--cards"),
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "RiverOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot open the selected frame."]) }
    let regions = try JSONDecoder().decode([Region].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
    guard regions.count <= 20 else { throw NSError(domain: "RiverOCR", code: 2) }
    var readings: [Reading] = []
    for region in regions {
        guard region.x >= 0, region.y >= 0, region.width > 0, region.height > 0, region.x + region.width <= 1.001, region.y + region.height <= 1.001 else { continue }
        let rect = CGRect(x: region.x * Double(image.width), y: region.y * Double(image.height), width: region.width * Double(image.width), height: region.height * Double(image.height)).integral
        guard let crop = image.cropping(to: rect) else { continue }
        let words = try recognize(crop).compactMap { observation -> Word? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let b = observation.boundingBox
            return Word(text: candidate.string, confidence: candidate.confidence, x: region.x + b.minX * region.width, y: region.y + (1-b.maxY) * region.height, width: b.width * region.width, height: b.height * region.height)
        }
        readings.append(Reading(id: region.id, words: words))
    }
    let cards = args.count == 4 ? detectCards(image) : nil
    let output = try JSONEncoder().encode(Output(width: image.width, height: image.height, readings: readings, cards: cards))
    FileHandle.standardOutput.write(output)
} catch {
    FileHandle.standardError.write(Data("Text recognition could not finish: \(error.localizedDescription)".utf8))
    exit(1)
}
