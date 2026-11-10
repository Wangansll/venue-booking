import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { authRequired, adminRequired, ok, wrap } from './lib.js';
import { AppError } from './errors.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },          // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new AppError(40000, '只支持 png / jpg / webp / svg'));
    cb(null, true);
  },
});

export const uploadRouter = Router();

uploadRouter.post('/admin/upload', authRequired, adminRequired, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new AppError(40000, '没有收到文件');
  ok(res, { url: `/uploads/${req.file.filename}`, size: req.file.size }, '上传成功');
}));

/** 静态目录：生产环境应由 Nginx 直接托管 */
export function serveUploads(app, express) {
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));
}
