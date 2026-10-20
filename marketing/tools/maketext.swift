// Renders one TikTok-style text overlay (bold white, black stroke) as a transparent 1080x1920 PNG.
// Usage: swift maketext.swift <out.png> <centerY> <fontSize> <text> [sub text] [subFontSize]
import AppKit

let args = CommandLine.arguments
guard args.count >= 5 else { print("usage: maketext out.png centerY fontSize text [sub] [subSize]"); exit(1) }
let out = args[1]
let centerY = CGFloat(Double(args[2]) ?? 600)
let size = CGFloat(Double(args[3]) ?? 96)
let text = args[4].replacingOccurrences(of: "\\n", with: "\n")
let sub: String? = args.count > 5 ? args[5].replacingOccurrences(of: "\\n", with: "\n") : nil
let subSize = CGFloat(Double(args.count > 6 ? args[6] : "56") ?? 56)

let W = 1080, H = 1920
guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8,
                                 samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(2) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.set()
NSRect(x: 0, y: 0, width: W, height: H).fill()

func attrs(_ pt: CGFloat) -> [NSAttributedString.Key: Any] {
    let p = NSMutableParagraphStyle()
    p.alignment = .center
    p.lineSpacing = pt * 0.06
    let font = NSFont(name: "AvenirNext-Heavy", size: pt) ?? NSFont.boldSystemFont(ofSize: pt)
    return [.font: font, .foregroundColor: NSColor.white, .strokeColor: NSColor.black,
            .strokeWidth: -9.0, .paragraphStyle: p]
}

func draw(_ s: String, pt: CGFloat, topFromCenter: CGFloat) -> CGFloat {
    let a = NSAttributedString(string: s, attributes: attrs(pt))
    let box = CGSize(width: CGFloat(W) - 140, height: 800)
    let r = a.boundingRect(with: box, options: [.usesLineFragmentOrigin])
    // NSBitmapImageRep origin is bottom-left; convert from top-based coordinates.
    let y = CGFloat(H) - topFromCenter - r.height
    a.draw(with: NSRect(x: 70, y: y, width: box.width, height: r.height), options: [.usesLineFragmentOrigin])
    return r.height
}

let h1 = draw(text, pt: size, topFromCenter: centerY)
if let sub = sub { _ = draw(sub, pt: subSize, topFromCenter: centerY + h1 + 28) }

NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
try png.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
