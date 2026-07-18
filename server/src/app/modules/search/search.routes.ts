import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { SearchController } from '@/app/modules/search/search.controllers';
import { SearchValidation } from '@/app/modules/search/search.validation';
import { AUTHENTICATED_ROLES, USER_ROLE } from '@/app/modules/user/user.constant';
import validateRequest from '@/app/utils/validateRequest';

const router = Router();

router
  .route('/')
  .get(auth(...AUTHENTICATED_ROLES), SearchController.getAllIntoDB)
  .post(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(SearchValidation.insertSearchValidationSchema),
    SearchController.insertIntoDB
  )
  .delete(auth(...AUTHENTICATED_ROLES), SearchController.clearSearchHistory);

router
  .route('/data')
  .get(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(SearchValidation.searchDataValidationSchema),
    SearchController.searchDataIntoDB
  );

router
  .route('/reindex')
  .post(auth(USER_ROLE.admin), SearchController.reindexIntoTypesense);

router
  .route('/:id')
  .delete(
    auth(...AUTHENTICATED_ROLES),
    validateRequest(SearchValidation.deleteSearchValidationSchema),
    SearchController.deleteAIntoDB
  );

export const SearchRoutes = router;
