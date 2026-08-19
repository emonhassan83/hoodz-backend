// handleDuplicateError.ts
import { IErrorMessage } from "@/app/@types/system.types";

const handleDuplicateError = (error: any, traceId?: string) => {
  const keys = error.keyValue ? Object.keys(error.keyValue) : [];
  const collection = String(error.message || error.errmsg || '');
  const isCompoundUserReference =
    keys.includes('user') &&
    keys.includes('modelType') &&
    keys.includes('reference');

  const duplicateMessage = collection.includes('wishlist')
    ? 'This item is already in your wishlist'
    : isCompoundUserReference
      ? 'You have already submitted a review for this item'
      : `${keys[0] || 'field'} already exists`;

  const errorMessages: IErrorMessage[] = [
    {
      path: isCompoundUserReference ? keys.join('.') : keys[0] || 'unknown',
      message: duplicateMessage,
    },
  ];

  const code = 409;
  return {
    code,
    message: 'Duplicate entry detected',
    errorMessages,
    traceId,
  };
};

export default handleDuplicateError;


