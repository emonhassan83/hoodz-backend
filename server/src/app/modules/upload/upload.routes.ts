import { Router } from 'express';
import multer, { memoryStorage } from 'multer';

import auth from '@/app/middlewares/auth';
import { UploadController } from '@/app/modules/upload/upload.controller';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';

const router = Router();
const storage = memoryStorage();
const upload = multer({ storage });

// Handle file upload
router
  .route('/')
  .post(
    auth(...AUTHENTICATED_ROLES),
    upload.single('file'),
    UploadController.single
  );

router
  .route('/multiple')
  .post(
    auth(...AUTHENTICATED_ROLES),
    upload.fields([{ name: 'files', maxCount: 10 }]),
    UploadController.multiple
  );

export const UploadRoutes = router;
