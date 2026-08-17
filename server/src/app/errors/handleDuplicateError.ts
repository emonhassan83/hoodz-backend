// handleDuplicateError.ts
import { IErrorMessage } from "@/app/@types/system.types";

const handleDuplicateError = (error: any, traceId?: string) => {
  const keys = error.keyValue ? Object.keys(error.keyValue) : [];
  const isReviewDuplicate =
    keys.includes('user') &&
    keys.includes('modelType') &&
    keys.includes('reference');

  const errorMessages: IErrorMessage[] = [
    {
      path: isReviewDuplicate ? 'review' : keys[0] || 'unknown',
      message: isReviewDuplicate
        ? 'You have already submitted a review for this item'
        : `${keys[0] || 'field'} already exists`,
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


