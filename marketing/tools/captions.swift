// Renders the native-TikTok-style caption layer as a transparent PNG sequence (1080x1920, 30fps).
// Short word chunks, bold white text with a thick black stroke, the word being spoken highlighted in the
// brand purple, quick pop-in on every new chunk. The first chunk(s) with style "headline" are bigger and sit
// in the upper third (the hook); style "caption" sits about 30% up from the bottom.
// Usage: swift captions.swift <captions.json> <out_dir>
// JSON: {"fps":30,"duration":23.0,"chunks":[{"start":0.1,"end":0.9,"style":"headline","words":[{"t":"Watch","s":0.1,"e":0.4}]}]}
import AppKit

struct Word: Decodable { let t: String; let s: Double; let e: Double }
struct Chunk: Decodable { let start: Double; let end: Double; let style: String; let words: [Word] }
struct Spec: Decodable { let fps: Int; let duration: Double; let chunks: [Chunk] }

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: captions.swift captions.json out_dir"); exit(1) }
let spec = try JSONDecoder().decode(Spec.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let outDir = args[2]
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let W = 1080, H = 1920
let highlight = NSColor(deviceRed: 0xB7 / 255, green: 0x9C / 255, blue: 0xFF / 255, alpha: 1) // light brand purple, readable on dark stroke
let white = NSColor.white

func makeRep() -> NSBitmapImageRep {
    NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4,
                     hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
}
func png(_ rep: NSBitmapImageRep) -> Data { rep.representation(using: .png, properties: [:])! }

// Blank frame, written for every frame with no caption.
let blank: Data = {
    let rep = makeRep()
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.clear.set()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    NSGraphicsContext.restoreGraphicsState()
    return png(rep)
}()

// Pop-in: 0.80 -> 1.08 -> 1.00 over the first 0.2s of a chunk.
func popScale(_ age: Double) -> CGFloat {
    if age >= 0.2 { return 1.0 }
    if age < 0.1 { return CGFloat(0.80 + 0.28 * (age / 0.1)) }
    return CGFloat(1.08 - 0.08 * ((age - 0.1) / 0.1))
}

func render(chunk: Chunk, t: Double) -> Data {
    let headline = chunk.style == "headline"
    let size: CGFloat = headline ? 106 : 96
    let font = NSFont(name: "AvenirNext-Heavy", size: size) ?? NSFont.boldSystemFont(ofSize: size)
    let para = NSMutableParagraphStyle()
    para.alignment = .center
    para.lineSpacing = size * 0.04
    // Index of the word being spoken: the last word whose start has passed (stays lit until the next starts).
    var active = 0
    for (i, w) in chunk.words.enumerated() where t >= w.s { active = i }
    let text = NSMutableAttributedString()
    for (i, w) in chunk.words.enumerated() {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font, .foregroundColor: i == active ? highlight : white,
            .strokeColor: NSColor.black, .strokeWidth: -11.0, .paragraphStyle: para,
        ]
        text.append(NSAttributedString(string: w.t + (i < chunk.words.count - 1 ? " " : ""), attributes: attrs))
    }
    let box = CGSize(width: 980, height: 600)
    let r = text.boundingRect(with: box, options: [.usesLineFragmentOrigin])
    // center in top-based coordinates, converted to the bitmap's bottom-left origin
    let cyTop = headline ? CGFloat(H) * 0.30 : CGFloat(H) * 0.70
    let cx = CGFloat(W) / 2, cy = CGFloat(H) - cyTop
    let rep = makeRep()
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    NSColor.clear.set()
    NSRect(x: 0, y: 0, width: W, height: H).fill()
    let s = popScale(t - chunk.start)
    let xf = NSAffineTransform()
    xf.translateX(by: cx, yBy: cy)
    xf.scaleX(by: s, yBy: s)
    xf.translateX(by: -cx, yBy: -cy)
    xf.concat()
    text.draw(with: NSRect(x: cx - box.width / 2, y: cy - r.height / 2, width: box.width, height: r.height),
              options: [.usesLineFragmentOrigin])
    NSGraphicsContext.restoreGraphicsState()
    return png(rep)
}

let frames = Int((spec.duration * Double(spec.fps)).rounded())
var cache: (Int, Int, Data)? = nil // (chunk index, highlighted word index) -> only reuse when pop is finished
for f in 0..<frames {
    let t = Double(f) / Double(spec.fps)
    var data = blank
    if let ci = spec.chunks.firstIndex(where: { t >= $0.start && t < $0.end }) {
        let chunk = spec.chunks[ci]
        var active = 0
        for (i, w) in chunk.words.enumerated() where t >= w.s { active = i }
        if t - chunk.start >= 0.2, let c = cache, c.0 == ci, c.1 == active {
            data = c.2
        } else {
            data = render(chunk: chunk, t: t)
            if t - chunk.start >= 0.2 { cache = (ci, active, data) }
        }
    }
    try data.write(to: URL(fileURLWithPath: String(format: "%@/%05d.png", outDir, f)))
}
print("rendered \(frames) frames to \(outDir)")
