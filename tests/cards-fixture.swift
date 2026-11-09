// Draws a synthetic poker table: felt, overlapped hole cards, a board with a face card,
// a pot label and action buttons. Style 1 uses two colours with the suit under the rank;
// style 2 uses a serif font, four-colour suits and the suit beside the rank.
import AppKit
let style = Int(CommandLine.arguments[2]) ?? 1
let size = style == 3 ? NSSize(width: 820, height: 520) : NSSize(width: 1280, height: 800)
let k: CGFloat = style == 3 ? 0.62 : 1
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.05, green: 0.32, blue: 0.2, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()
let rankFont = style == 1 ? NSFont.boldSystemFont(ofSize: 30) : style == 3 ? NSFont(name: "Verdana-Bold", size: 18)! : NSFont(name: "Georgia-Bold", size: 30)!
let suitFont = style == 1 ? NSFont.systemFont(ofSize: 26) : style == 3 ? NSFont.systemFont(ofSize: 16) : NSFont(name: "Georgia", size: 24)!
func color(_ suit: String) -> NSColor {
    if style == 2 && suit == "♦" { return NSColor(calibratedRed: 0.1, green: 0.3, blue: 0.85, alpha: 1) }
    if style == 2 && suit == "♣" { return NSColor(calibratedRed: 0.1, green: 0.55, blue: 0.15, alpha: 1) }
    return suit == "♥" || suit == "♦" ? NSColor(calibratedRed: 0.8, green: 0.05, blue: 0.1, alpha: 1) : .black
}
// AppKit's origin is bottom-left; `top` is measured from the top edge.
func card(_ rank: String, _ suit: String, x x0: CGFloat, top t0: CGFloat, w w0: CGFloat = 84, h h0: CGFloat = 120, face: Bool = false) {
    let x = x0 * k, top = t0 * k, w = w0 * k, h = h0 * k
    let rect = NSRect(x: x, y: size.height - top - h, width: w, height: h)
    NSColor(white: 0.55, alpha: 1).setStroke()
    (style == 3 ? NSColor(calibratedRed: 0.98, green: 0.95, blue: 0.86, alpha: 1) : NSColor(white: 0.99, alpha: 1)).setFill()
    let path = NSBezierPath(roundedRect: rect, xRadius: 7, yRadius: 7)
    path.fill(); path.lineWidth = 1.5; path.stroke()
    let c = color(suit)
    rank.draw(at: NSPoint(x: x + 7 * k, y: rect.maxY - 38 * k), withAttributes: [.font: rankFont, .foregroundColor: c])
    if style != 2 {
        suit.draw(at: NSPoint(x: x + 8 * k, y: rect.maxY - 70 * k), withAttributes: [.font: suitFont, .foregroundColor: c])
    } else {
        let width = (rank as NSString).size(withAttributes: [.font: rankFont]).width
        suit.draw(at: NSPoint(x: x + 9 + width, y: rect.maxY - 37), withAttributes: [.font: suitFont, .foregroundColor: c])
    }
    if face {
        NSColor(calibratedRed: 0.85, green: 0.6, blue: 0.2, alpha: 1).setFill()
        NSRect(x: x + 30 * k, y: rect.minY + 14 * k, width: w - 44 * k, height: h - 78 * k).fill()
    } else {
        suit.draw(at: NSPoint(x: x + w / 2 - 12 * k, y: rect.minY + 22 * k), withAttributes: [.font: NSFont.systemFont(ofSize: 34 * k), .foregroundColor: c])
    }
}
func back(x: CGFloat, top: CGFloat) {
    NSColor(calibratedRed: 0.6, green: 0.1, blue: 0.15, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: x, y: size.height - top - 64, width: 46, height: 64), xRadius: 4, yRadius: 4).fill()
}
back(x: 160, top: 120); back(x: 180, top: 120); back(x: 1050, top: 120); back(x: 1070, top: 120)
card("J", "♠", x: 410, top: 300, face: true)
card("10", "♥", x: 505, top: 300)
card("7", "♣", x: 600, top: 300)
card("2", "♦", x: 695, top: 300)
if style == 3 { card("Q", "♦", x: 790, top: 300, face: true) }
card("A", "♠", x: 560, top: 560)
card("K", "♥", x: 610, top: 560, face: true)
let label: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: 24), .foregroundColor: NSColor.white]
"Pot: 12.40".draw(at: NSPoint(x: 560, y: size.height - 255), withAttributes: label)
for (i, text) in ["Fold", "Call 2.00", "Raise"].enumerated() {
    let r = NSRect(x: 820 + CGFloat(i) * 150, y: 40, width: 135, height: 54)
    NSColor(calibratedRed: 0.15, green: 0.15, blue: 0.17, alpha: 1).setFill()
    NSBezierPath(roundedRect: r, xRadius: 8, yRadius: 8).fill()
    text.draw(at: NSPoint(x: r.minX + 18, y: r.minY + 14), withAttributes: label)
}
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
