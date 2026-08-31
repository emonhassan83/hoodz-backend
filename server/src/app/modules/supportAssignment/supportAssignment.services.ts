import QueryBuilder from '@/app/builder/QueryBuilder';
import { SupportAssignment } from '@/app/modules/supportAssignment/supportAssignment.model';

const assignmentPopulate = [
  { path: 'customer', select: 'name email phone profileAvatar' },
  { path: 'agent', select: 'name email phone profileAvatar agentSchedule timeZone' },
];

/** Admin view of all customer-agent assignments. */
const getAllSupportAssignments = async (query: Record<string, unknown>) => {
  const assignmentQuery = new QueryBuilder(
    SupportAssignment.find()
      .populate(assignmentPopulate)
      .select('customer agent createdAt updatedAt')
      .lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    assignmentQuery.modelQuery,
    assignmentQuery.countTotal(),
  ]);

  return { meta, data };
};

export const SupportAssignmentService = {
  getAllSupportAssignments,
};
