// Builds photos.json and the 512px stream textures from home/assets/photos.
// Run from the repo root: swift home/tools/build-catalog.swift
import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = "home/assets/photos"
let thumbs = root + "/t"
let skip: Set<String> = [
  "000010", "9649041e-f157-464b-b08b-3d8d33c6e2a7", "bazx5-14",
  "img_1789", "img_1791", "img_4772", "img_5080", "img_6242",
  "wechatimg11156", "wechatimg11157",
]
try? FileManager.default.createDirectory(atPath: thumbs, withIntermediateDirectories: true)
let files = try! FileManager.default.contentsOfDirectory(atPath: root)
  .filter { $0.hasSuffix(".jpg") && !skip.contains(String($0.dropLast(4))) }
  .sorted()

var out: [[String: Any]] = []
for f in files {
  let id = String(f.dropLast(4))
  let url = URL(fileURLWithPath: root + "/" + f) as CFURL
  guard let src = CGImageSourceCreateWithURL(url, nil),
        let img = CGImageSourceCreateThumbnailAtIndex(src, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 512,
        ] as CFDictionary) else { continue }
  let tURL = URL(fileURLWithPath: thumbs + "/" + f) as CFURL
  let dst = CGImageDestinationCreateWithURL(tURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, img, [kCGImageDestinationLossyCompressionQuality: 0.78] as CFDictionary)
  CGImageDestinationFinalize(dst)

  let ctx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .medium
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: 1, height: 1))
  let px = ctx.data!.assumingMemoryBound(to: UInt8.self)
  let avg = [px[0], px[1], px[2]].map { (Double($0) / 255 * 1000).rounded() / 1000 }
  let aspect = (Double(img.width) / Double(img.height) * 10000).rounded() / 10000
  out.append(["id": id, "src": "assets/photos/\(f)", "thumb": "assets/photos/t/\(f)",
              "aspect": aspect, "avg": avg, "description": "", "photographer": ""])
}
let json = try! JSONSerialization.data(withJSONObject: ["photos": out], options: [.prettyPrinted, .sortedKeys])
try! json.write(to: URL(fileURLWithPath: "home/photos.json"))
print("photos:", out.count)
