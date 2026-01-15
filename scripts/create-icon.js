const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#5865F2"/>
      <stop offset="100%" style="stop-color:#4752C4"/>
    </linearGradient>
  </defs>
  <circle cx="128" cy="128" r="120" fill="url(#bg)"/>
  <circle cx="88" cy="100" r="18" fill="#1e2139"/>
  <circle cx="168" cy="100" r="18" fill="#1e2139"/>
  <path d="M72 155 Q128 210 184 155" stroke="#1e2139" stroke-width="16" fill="none" stroke-linecap="round"/>
</svg>`

const outputDir = path.join(__dirname, '..', 'resources')
const pngPath = path.join(outputDir, 'icon.png')
const icoPath = path.join(outputDir, 'icon.ico')

async function createIcon() {
  // SVG -> PNG (256x256)
  await sharp(Buffer.from(svgContent))
    .resize(256, 256)
    .png()
    .toFile(pngPath)
  
  console.log('PNG created:', pngPath)
  
  // 使用 sharp 生成多尺寸 PNG，然后手动构建 ICO
  const sizes = [16, 32, 48, 256]
  const pngBuffers = await Promise.all(
    sizes.map(size => 
      sharp(Buffer.from(svgContent))
        .resize(size, size)
        .png()
        .toBuffer()
    )
  )
  
  // 构建 ICO 文件
  const icoBuffer = createIco(pngBuffers, sizes)
  fs.writeFileSync(icoPath, icoBuffer)
  
  console.log('ICO created:', icoPath)
}

// 简单的 ICO 文件构建器
function createIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  const dataOffset = headerSize + (dirEntrySize * numImages)
  
  let totalSize = dataOffset
  pngBuffers.forEach(buf => totalSize += buf.length)
  
  const ico = Buffer.alloc(totalSize)
  
  // ICO Header
  ico.writeUInt16LE(0, 0)      // Reserved
  ico.writeUInt16LE(1, 2)      // Type: 1 = ICO
  ico.writeUInt16LE(numImages, 4) // Number of images
  
  let currentOffset = dataOffset
  
  // Directory entries
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const pngBuf = pngBuffers[i]
    const entryOffset = headerSize + (i * dirEntrySize)
    
    ico.writeUInt8(size === 256 ? 0 : size, entryOffset)     // Width (0 = 256)
    ico.writeUInt8(size === 256 ? 0 : size, entryOffset + 1) // Height (0 = 256)
    ico.writeUInt8(0, entryOffset + 2)                        // Color palette
    ico.writeUInt8(0, entryOffset + 3)                        // Reserved
    ico.writeUInt16LE(1, entryOffset + 4)                     // Color planes
    ico.writeUInt16LE(32, entryOffset + 6)                    // Bits per pixel
    ico.writeUInt32LE(pngBuf.length, entryOffset + 8)         // Image size
    ico.writeUInt32LE(currentOffset, entryOffset + 12)        // Image offset
    
    // Copy PNG data
    pngBuf.copy(ico, currentOffset)
    currentOffset += pngBuf.length
  }
  
  return ico
}

createIcon().catch(console.error)
