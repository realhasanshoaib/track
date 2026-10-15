import { useCallback, useMemo, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useAppToast } from '@/components/app-toast';
import { CompanyPickerScreen, type CompanyInviteItem, type CompanyPickerItem } from '@/components/company-picker-screen';
import { EmptyState } from '@/components/empty-state';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBottomTabContentInset } from '@/hooks/use-bottom-tab-inset';
import { useCompany } from '@/contexts/company-context';
import { useTrackUser } from '@/contexts/track-user-context';
import { companyRoleLabel } from '@/lib/role-label';
import { useTheme } from '@/hooks/use-theme';

export default function CompanyScreen() {
  const theme = useTheme();
  const { showToast } = useAppToast();
  const bottomContentInset = useBottomTabContentInset(Spacing.six);
  const { trackUserId } = useTrackUser();
  const { actingCompanyId, companies, companyModelEnabled, setActingCompanyId } = useCompany();
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const pendingDecisionRef = useRef<string | null>(null);
  const companyInvitations = useQuery(api.companies.listPendingForMe, companyModelEnabled ? {} : 'skip');
  const relationshipInvitations = useQuery(api.relationships.listInvitations, actingCompanyId ? { actingCompanyId } : 'skip');
  const projectInvitations = useQuery(api.sharedProjects.listInvitations, actingCompanyId ? { actingCompanyId } : 'skip');
  const decideCompanyInvitation = useMutation(api.companies.decideInvitation);
  const decideRelationshipInvitation = useMutation(api.relationships.decideInvitation);
  const decideProjectInvitation = useMutation(api.sharedProjects.decideInvitation);

  const pickerCompanies = useMemo<CompanyPickerItem<Id<'companies'>>[]>(() => [...(companies ?? [])]
    .filter(({ company }) => Boolean(company))
    .sort((left, right) => {
      if (left.company?.status !== right.company?.status) return left.company?.status === 'active' ? -1 : 1;
      return (left.company?.displayName ?? '').localeCompare(right.company?.displayName ?? '');
    })
    .flatMap(({ company }) => company ? [{
      id: company._id,
      name: company.displayName,
      status: company.status === 'active' ? 'active' : 'unavailable',
      imageUrl: company.logoUrl,
    }] : []), [companies]);

  const run = useCallback(async (id: string, action: () => Promise<unknown>, success: string) => {
    if (pendingDecisionRef.current) return;
    pendingDecisionRef.current = id;
    setPendingDecision(id);
    try {
      const result = await action();
      if (typeof result === 'object' && result !== null && 'status' in result && result.status === 'expired') throw new Error('invitation_expired');
      showToast({ title: success, tone: 'success' });
    } catch {
      showToast({ title: 'Action unavailable', message: 'Your authority or the invitation changed. Refresh and try again.', tone: 'error' });
    } finally {
      pendingDecisionRef.current = null;
      setPendingDecision(null);
    }
  }, [showToast]);

  const invitationCompanyId = actingCompanyId;
  const companyInviteRows: CompanyInviteItem[] = (companyInvitations ?? []).map(({ company, invitation }) => {
    const id = String(invitation._id);
    const decision: CompanyInviteItem['decision'] = pendingDecision === id ? 'accept' : pendingDecision === `${id}:decline` ? 'decline' : null;
    return {
      id,
      title: company?.displayName ?? 'Company invitation',
      detail: `Company invitation · Join as ${companyRoleLabel(invitation.role)}`,
      decision,
      busy: pendingDecision !== null,
      onAccept: () => void run(id, () => decideCompanyInvitation({ invitationId: invitation._id, decision: 'accept' }), 'Company joined'),
      onDecline: () => void run(`${id}:decline`, () => decideCompanyInvitation({ invitationId: invitation._id, decision: 'decline' }), 'Invitation declined'),
    };
  });
  const relationshipInviteRows: CompanyInviteItem[] = [];
  if (invitationCompanyId) {
    const companyId = invitationCompanyId;
    for (const { invitation, inviter, invitingCompany, relationship, participants } of relationshipInvitations ?? []) {
      const id = String(invitation._id);
      const decision: CompanyInviteItem['decision'] = pendingDecision === id ? 'accept' : pendingDecision === `${id}:decline` ? 'decline' : null;
      const participantNames = participants.map((company) => company.displayName).join(', ');
      relationshipInviteRows.push({
        id,
        title: relationship?.name ?? 'Company relationship',
        detail: `From ${invitingCompany?.displayName ?? 'another Company'} · Invited by ${inviter?.displayName ?? 'an administrator'} · Shared with ${participantNames}`,
        decision,
        busy: pendingDecision !== null,
        onAccept: () => void run(id, () => decideRelationshipInvitation({ actingCompanyId: companyId, invitationId: invitation._id, decision: 'accept' }), 'Relationship joined'),
        onDecline: () => void run(`${id}:decline`, () => decideRelationshipInvitation({ actingCompanyId: companyId, invitationId: invitation._id, decision: 'decline' }), 'Invitation declined'),
      });
    }
  }
  const projectInviteRows: CompanyInviteItem[] = [];
  if (invitationCompanyId && trackUserId) {
    const companyId = invitationCompanyId;
    const userId = trackUserId;
    for (const { invitation, invitingCompany, project } of projectInvitations ?? []) {
      const id = String(invitation._id);
      const decision: CompanyInviteItem['decision'] = pendingDecision === id ? 'accept' : pendingDecision === `${id}:decline` ? 'decline' : null;
      projectInviteRows.push({
        id,
        title: project?.name ?? 'Project invitation',
        detail: `Project invitation from ${invitingCompany?.displayName ?? 'another Company'} · Access is limited to selected Channels.`,
        decision,
        busy: pendingDecision !== null,
        onAccept: () => void run(id, () => decideProjectInvitation({ actingCompanyId: companyId, invitationId: invitation._id, decision: 'accept', initialMembers: [{ userId, role: 'manager' }] }), 'Project joined'),
        onDecline: () => void run(`${id}:decline`, () => decideProjectInvitation({ actingCompanyId: companyId, invitationId: invitation._id, decision: 'decline', initialMembers: [] }), 'Invitation declined'),
      });
    }
  }
  const invitations = [...companyInviteRows, ...relationshipInviteRows, ...projectInviteRows];

  if (!companyModelEnabled) return <ThemedView style={[styles.screen, { backgroundColor: theme.homeBackground }]}>
    <Stack.Screen options={{ title: 'Companies' }} />
    <EmptyState body="Company workspaces aren’t available here yet." icon="office-building" title="Company workspace unavailable" />
  </ThemedView>;

  return <ThemedView style={[styles.screen, { backgroundColor: theme.homeBackground }]}>
    <Stack.Screen options={{ title: 'Companies' }} />
    <CompanyPickerScreen
      bottomPadding={bottomContentInset}
      companies={pickerCompanies}
      companiesLoading={companies === undefined}
      invitations={invitations}
      invitationsLoading={companyInvitations === undefined || Boolean(actingCompanyId && (relationshipInvitations === undefined || projectInvitations === undefined))}
      onSelectCompany={setActingCompanyId}
      selectedCompanyId={actingCompanyId}
    />
  </ThemedView>;
}

const styles = { screen: { flex: 1 } };
