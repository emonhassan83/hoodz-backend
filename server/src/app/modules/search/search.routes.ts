import { Router } from 'express';

import auth, { optionalAuth } from '@/app/middlewares/auth';
import { SearchController } from '@/app/modules/search/search.controllers';
import { SearchValidation } from '@/app/modules/search/search.validation';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(optionalAuth, SearchController.getAllIntoDB)
  .post(
    optionalAuth,
    validateRequest(SearchValidation.insertSearchValidationSchema),
    SearchController.insertIntoDB
  )
  .delete(optionalAuth, SearchController.clearSearchHistory);

router
  .route('/data')
  .get(
    optionalAuth,
    validateRequest(SearchValidation.searchDataValidationSchema),
    SearchController.searchDataIntoDB
  );

router
  .route('/filter-page-data')
  .get(optionalAuth, SearchController.getFilterPageData);

router
  .route('/reindex')
  .post(auth(USER_ROLE.admin), SearchController.reindexIntoTypesense);

router
  .route('/:id')
  .delete(
    optionalAuth,
    validateRequest(SearchValidation.deleteSearchValidationSchema),
    SearchController.deleteAIntoDB
  );

export const SearchRoutes = router;


