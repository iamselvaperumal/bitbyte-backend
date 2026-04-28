const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const AppError = require('../utils/AppError');

const CLOUD_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PLACEHOLDER_CLOUD_NAMES = new Set([
  'example',
  'your_cloud_name',
  '<cloud_name>',
]);

const getCloudinaryConfigError = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.';
  }

  if (PLACEHOLDER_CLOUD_NAMES.has(CLOUDINARY_CLOUD_NAME.toLowerCase())) {
    return 'Cloudinary cloud name is still a placeholder. Set CLOUDINARY_CLOUD_NAME to the cloud name from Cloudinary API Keys.';
  }

  if (!CLOUD_NAME_PATTERN.test(CLOUDINARY_CLOUD_NAME)) {
    return 'Invalid Cloudinary cloud name. Use the exact cloud name from Cloudinary settings; it can contain only letters, numbers, hyphens, and underscores.';
  }

  return null;
};

const ensureCloudinaryConfigured = (req, res, next) => {
  const configError = getCloudinaryConfigError();
  if (configError) {
    return next(new AppError(configError, 500));
  }
  next();
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/pdf',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `employee-onboarding/${req.user.id}/documents`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto',
    public_id: `${file.fieldname}_${Date.now()}`,
  }),
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { cloudinary, ensureCloudinaryConfigured, upload };
