import type { Id } from "../../../../../convex/_generated/dataModel";

export type CompanyProjectLinkContext = {
  actingCompanyId: Id<"companies">;
  projectId: Id<"projects">;
  projectMemberId: Id<"projectMembers">;
  groupId?: string;
};

export function getCompanyProjectConversationSearch(
  context: CompanyProjectLinkContext,
) {
  return {
    companyId: context.actingCompanyId,
    groupId: context.groupId ?? "",
    membershipId: context.projectMemberId,
  };
}
