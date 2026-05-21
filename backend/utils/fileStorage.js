const fs = require('fs/promises');
const { v2: cloudinary } = require('cloudinary');

const cloudinaryEnabled = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryEnabled) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

function isCloudinaryEnabled() {
    return cloudinaryEnabled;
}

async function storeUploadedFile(file, { folder, fallbackPath, resourceType = 'auto' }) {
    if (!file) {
        return null;
    }

    if (!cloudinaryEnabled) {
        return fallbackPath;
    }

    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder,
            resource_type: resourceType,
        });

        return result.secure_url;
    } finally {
        await fs.unlink(file.path).catch(() => {});
    }
}

module.exports = {
    isCloudinaryEnabled,
    storeUploadedFile,
};
