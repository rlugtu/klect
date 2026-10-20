// Renders the Klect end card: brand gradient with a wordmark and the call to action.
// Usage: swift endcard.swift <out.png> <line1> <line2>
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: endcard out.png line1 line2"); exit(1) }
let out = args[1]
let line1 = args[2]
let line2 = args[3].replacingOccurrences(of: "\\n", with: "\n")

let W = 1080, H = 1920
guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8,
                                 samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(2) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// Brand hero gradient from marketing docs: #F7A8D4 -> #A78BFA -> #56A8FF
func rgb(_ r: Double, _ g: Double, _ b: Double) -> NSColor { NSColor(deviceRed: r/255, green: g/255, blue: b/255, alpha: 1) }
let grad = NSGradient(colors: [rgb(0xF7, 0xA8, 0xD4), rgb(0xA7, 0x8B, 0xFA), rgb(0x56, 0xA8, 0xFF)])!
grad.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -60)

func centered(_ s: String, pt: CGFloat, weight: String, y: CGFloat) {
    let p = NSMutableParagraphStyle()
    p.alignment = .center
    p.lineSpacing = pt * 0.1
    let font = NSFont(name: weight, size: pt) ?? NSFont.boldSystemFont(ofSize: pt)
    let a = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: p])
    let box = CGSize(width: CGFloat(W) - 160, height: 600)
    let r = a.boundingRect(with: box, options: [.usesLineFragmentOrigin])
    a.draw(with: NSRect(x: 80, y: CGFloat(H) - y - r.height, width: box.width, height: r.height), options: [.usesLineFragmentOrigin])
}

centered(line1, pt: 190, weight: "AvenirNext-Heavy", y: 700)
centered(line2, pt: 72, weight: "AvenirNext-DemiBold", y: 960)

NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
try png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
