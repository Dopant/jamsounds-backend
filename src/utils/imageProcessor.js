import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Create optimized versions of uploaded images
export async function processImage(filePath, options = {}) {
  const {
    quality = 85,
    format = 'jpeg',
    width,
    height,
    fit = 'cover',
    position = 'center'
  } = options;

  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    // Resize if dimensions provided
    if (width || height) {
      image.resize(width, height, {
        fit,
        position
      });
    }

    // Convert to specified format with quality
    if (format === 'jpeg') {
      image.jpeg({ quality });
    } else if (format === 'webp') {
      image.webp({ quality });
    } else if (format === 'png') {
      image.png({ quality });
    }

    // Generate optimized version with a temporary filename first
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const timestamp = Date.now();
    // Keep the original extension to avoid conflicts
    const tempPath = path.join(dir, `${baseName}_temp_${timestamp}${ext}`);
    
    // Create the optimized file with a temporary name
    await image.toFile(tempPath);
    
    // Verify the file was created successfully
    if (!fs.existsSync(tempPath)) {
      console.error('Failed to create optimized image:', tempPath);
      return filePath; // Return original if processing fails
    }
    
    // Now replace the original file with the optimized version
    try {
      fs.unlinkSync(filePath); // Delete original
      fs.renameSync(tempPath, filePath); // Rename temp to original name
      console.log('Successfully processed image:', filePath);
      return filePath;
    } catch (error) {
      console.error('Error replacing original file:', error);
      // If replacement fails, try to keep the temp file
      if (fs.existsSync(tempPath)) {
        return tempPath;
      }
      return filePath; // Return original if all else fails
    }
  } catch (error) {
    console.error('Image processing error:', error);
    return filePath; // Return original if processing fails
  }
}

// Process hero images (large, high quality)
export async function processHeroImage(filePath) {
  return processImage(filePath, {
    quality: 90,
    format: 'jpeg',
    width: 1200,
    height: 800,
    fit: 'cover'
  });
}

// Process author images (small, optimized for avatars)
export async function processAuthorImage(filePath) {
  return processImage(filePath, {
    quality: 85,
    format: 'jpeg',
    width: 200,
    height: 200,
    fit: 'cover'
  });
}

// Process thumbnail images (small cards)
export async function processThumbnailImage(filePath) {
  return processImage(filePath, {
    quality: 80,
    format: 'jpeg',
    width: 400,
    height: 300,
    fit: 'cover'
  });
}

// Generate multiple sizes for responsive images
export async function generateResponsiveImages(filePath) {
  const sizes = [
    { width: 1200, height: 800, suffix: '_large' },
    { width: 800, height: 600, suffix: '_medium' },
    { width: 400, height: 300, suffix: '_small' },
    { width: 200, height: 200, suffix: '_thumbnail' }
  ];

  const processedImages = [];
  
  for (const size of sizes) {
    const processedPath = await processImage(filePath, {
      quality: 85,
      format: 'jpeg',
      width: size.width,
      height: size.height,
      fit: 'cover'
    });
    
    // Rename to include size suffix
    const newPath = processedPath.replace('_optimized', size.suffix);
    fs.renameSync(processedPath, newPath);
    processedImages.push(newPath);
  }

  return processedImages;
} 