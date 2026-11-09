import Foundation
import Vision
import ImageIO

struct Region: Decodable { let id: String; let x: Double; let y: Double; let width: Double; let height: Double }
struct Word: Encodable { let text: String; let confidence: Float; let x: Double; let y: Double; let width: Double; let height: Double }
struct Reading: Encodable { let id: String; let words: [Word] }
struct Output: Encodable { let width: Int; let height: Int; let readings: [Reading] }
do {
    guard CommandLine.arguments.count == 3,
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "RiverOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot open the selected frame."]) }
    let regions = try JSONDecoder().decode([Region].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
    guard regions.count <= 20 else { throw NSError(domain: "RiverOCR", code: 2) }
    var readings: [Reading] = []
    for region in regions {
        guard region.x >= 0, region.y >= 0, region.width > 0, region.height > 0, region.x + region.width <= 1.001, region.y + region.height <= 1.001 else { continue }
        let rect = CGRect(x: region.x * Double(image.width), y: region.y * Double(image.height), width: region.width * Double(image.width), height: region.height * Double(image.height)).integral
        guard let crop = image.cropping(to: rect) else { continue }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.008
        try VNImageRequestHandler(cgImage: crop, options: [:]).perform([request])
        let words = (request.results ?? []).compactMap { observation -> Word? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let b = observation.boundingBox
            return Word(text: candidate.string, confidence: candidate.confidence, x: region.x + b.minX * region.width, y: region.y + (1-b.maxY) * region.height, width: b.width * region.width, height: b.height * region.height)
        }
        readings.append(Reading(id: region.id, words: words))
    }
    let output = try JSONEncoder().encode(Output(width: image.width, height: image.height, readings: readings))
    FileHandle.standardOutput.write(output)
} catch {
    FileHandle.standardError.write(Data("Text recognition could not finish: \(error.localizedDescription)".utf8))
    exit(1)
}
