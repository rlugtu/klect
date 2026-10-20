// Draws the non-recorded "before" scenes for the ads. Generic labels only, no real app logos.
// Usage:
//   swift scenes.swift messy <out.png>            tall notepad page full of bare links (1080x3600)
//   swift scenes.swift tile <out.png> <label> <r> <g> <b>   full-frame colored tile with a big label (1080x1920)
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: scenes.swift messy|tile out.png ..."); exit(1) }
let mode = args[1]
let out = args[2]

func makeRep(_ w: Int, _ h: Int) -> NSBitmapImageRep {
    NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
}
func save(_ rep: NSBitmapImageRep) {
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
    print("wrote \(out)")
}
func color(_ hex: UInt32) -> NSColor {
    NSColor(deviceRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

if mode == "messy" {
    let W = 1080, H = 3600
    let rep = makeRep(W, H)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    color(0xFBF3C8).set()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    // ruled lines
    color(0xE3D79A).set()
    var y = 80
    while y < H { NSRect(x: 0, y: y, width: W, height: 2).fill(); y += 72 }
    let links = [
        "https://www.instagram.com/reel/C8xk2Lq9aP/", "that coffee place?? maybe on grove st",
        "https://www.tiktok.com/@foodie/video/73918273", "recipe from nina - SAVE",
        "https://maps.app.goo.gl/Qx7Lm2VtT9", "https://www.nytimes.com/2024/05/recipes",
        "airbnb for june?? check later", "https://www.airbnb.com/rooms/58291034",
        "https://youtu.be/9bZkp7q19f0", "restaurant jen mentioned (pasta)",
        "https://www.reddit.com/r/nyc/comments/1a2b3c", "https://www.amazon.com/dp/B0CHX1W1XY",
        "gift ideas for dad???", "https://www.instagram.com/p/CzT81aaB/",
        "https://maps.app.goo.gl/Hk39sPPe2", "good bakery near work",
        "https://www.tiktok.com/@trips/video/74221109", "https://www.etsy.com/listing/1182210",
        "weekend plan idea", "https://www.eater.com/maps/best-restaurants",
    ]
    let mono = NSFont(name: "Menlo-Regular", size: 38) ?? NSFont.systemFont(ofSize: 38)
    let hand = NSFont(name: "Noteworthy-Light", size: 44) ?? NSFont.systemFont(ofSize: 44)
    var line = 0
    var top = 40
    while top < H - 120 {
        let s = links[line % links.count]
        let isLink = s.hasPrefix("http")
        let attrs: [NSAttributedString.Key: Any] = isLink
            ? [.font: mono, .foregroundColor: color(0x2B5FB8), .underlineStyle: NSUnderlineStyle.single.rawValue]
            : [.font: hand, .foregroundColor: color(0x4A4A4A)]
        NSAttributedString(string: s, attributes: attrs)
            .draw(at: NSPoint(x: 48, y: CGFloat(H - top - 60)))
        top += 72
        line += 1
    }
    NSGraphicsContext.restoreGraphicsState()
    save(rep)
} else if mode == "mask" {
    // Bottom strip that fades into the app background, hiding dev-build warning toasts in screen recordings.
    // Usage: swift scenes.swift mask <out.png> <r> <g> <b>
    let r = CGFloat(Double(args[3]) ?? 245) / 255, g = CGFloat(Double(args[4]) ?? 245) / 255, b = CGFloat(Double(args[5]) ?? 249) / 255
    let W = 1080, H = 1920
    let rep = makeRep(W, H)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.clear.set()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    let clear = NSColor(deviceRed: r, green: g, blue: b, alpha: 0)
    let solid = NSColor(deviceRed: r, green: g, blue: b, alpha: 1)
    // bitmap origin is bottom-left: solid at the very bottom, fading up to clear
    NSGradient(colors: [solid, solid, clear], atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)!
        .draw(in: NSRect(x: 0, y: 0, width: W, height: 260), angle: 90)
    NSGraphicsContext.restoreGraphicsState()
    save(rep)
} else if mode == "tile" {
    guard args.count >= 7 else { print("tile needs label r g b"); exit(1) }
    let label = args[3].replacingOccurrences(of: "\\n", with: "\n")
    let r = CGFloat(Double(args[4]) ?? 0) / 255, g = CGFloat(Double(args[5]) ?? 0) / 255, b = CGFloat(Double(args[6]) ?? 0) / 255
    let W = 1080, H = 1920
    let rep = makeRep(W, H)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor(deviceRed: r, green: g, blue: b, alpha: 1).set()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    let p = NSMutableParagraphStyle()
    p.alignment = .center
    let font = NSFont(name: "AvenirNext-Heavy", size: 120) ?? NSFont.boldSystemFont(ofSize: 120)
    let a = NSAttributedString(string: label, attributes: [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: p])
    let box = CGSize(width: CGFloat(W) - 160, height: 700)
    let rect = a.boundingRect(with: box, options: [.usesLineFragmentOrigin])
    a.draw(with: NSRect(x: 80, y: CGFloat(H) * 0.36 - rect.height / 2, width: box.width, height: rect.height),
           options: [.usesLineFragmentOrigin])
    NSGraphicsContext.restoreGraphicsState()
    save(rep)
}
