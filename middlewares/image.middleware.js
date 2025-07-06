// middleware/image.middleware.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const optimizeImage = async (req, res, next) => {
    if (!req.file) {
        return next();
    }

    try {
        const originalPath = req.file.path;
        const optimizedPath = path.join(
            path.dirname(originalPath),
            'opt_' + path.basename(originalPath, path.extname(originalPath)) + '.jpg'
        );

        await sharp(originalPath)
            .resize(400, 400, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({
                quality: 80,
                progressive: true
            })
            .toFile(optimizedPath);

        // Delete original file
        fs.unlinkSync(originalPath);

        // Update req.file to point to optimized image
        req.file.path = optimizedPath;
        req.file.filename = path.basename(optimizedPath);

        next();
    } catch (error) {
        console.error('Image optimization error:', error);
        // Continue without optimization if it fails
        next();
    }
};

module.exports = { optimizeImage };