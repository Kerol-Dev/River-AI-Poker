import AppKit
let size=NSSize(width:1200,height:800)
let image=NSImage(size:size)
image.lockFocus()
NSColor.white.setFill();NSRect(origin:.zero,size:size).fill()
let font=NSFont.monospacedSystemFont(ofSize:40,weight:.bold)
for (text,y) in [("As Qh",650.0),("Ks 7d 2c",520.0),("Pot: 4.20",390.0),("Call 1.20",260.0),("Fold Call Raise",130.0)] {
 text.draw(at:NSPoint(x:90,y:y),withAttributes:[.font:font,.foregroundColor:NSColor.black])
}
image.unlockFocus()
let bitmap=NSBitmapImageRep(data:image.tiffRepresentation!)!
try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
