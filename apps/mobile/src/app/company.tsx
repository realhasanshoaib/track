import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useCompany } from "@/contexts/company-context";
import { useTrackUser } from "@/contexts/track-user-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing, TouchTarget } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "react-i18next";

export default function CompanyScreen() {
  const theme = useTheme();
  const { t } = useTranslation('work');
  const { trackUserId } = useTrackUser();
  const {
    actingCompanyId,
    companies,
    companyModelEnabled,
    setActingCompanyId,
  } = useCompany();
  const actingCompany = companies?.find(
    ({ company }) => company?._id === actingCompanyId,
  );
  const canAdministerActingCompany =
    actingCompany?.membership.role === "owner" ||
    actingCompany?.membership.role === "admin";
  const companyInvitations = useQuery(
    api.companies.listPendingForMe,
    companyModelEnabled ? {} : "skip",
  );
  const relationshipInvitations = useQuery(
    api.relationships.listInvitations,
    actingCompanyId && canAdministerActingCompany
      ? { actingCompanyId }
      : "skip",
  );
  const projectInvitations = useQuery(
    api.sharedProjects.listInvitations,
    actingCompanyId && canAdministerActingCompany
      ? { actingCompanyId }
      : "skip",
  );
  const relationships = useQuery(
    api.relationships.listMine,
    actingCompanyId && canAdministerActingCompany
      ? { actingCompanyId }
      : "skip",
  );
  const decideCompanyInvitation = useMutation(api.companies.decideInvitation);
  const decideRelationshipInvitation = useMutation(
    api.relationships.decideInvitation,
  );
  const decideProjectInvitation = useMutation(
    api.sharedProjects.decideInvitation,
  );

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      Alert.alert(success);
    } catch {
      Alert.alert(t('company.actionUnavailable'), t('company.actionUnavailableBody'));
    }
  }

  if (!companyModelEnabled)
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('company.title') }} />
        <View style={styles.empty}>
          <ThemedText type="subtitle">
            {t('company.disabledTitle')}
          </ThemedText>
          <ThemedText>
            {t('company.disabledBody')}
          </ThemedText>
        </View>
      </ThemedView>
    );

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: t('company.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{t('company.actingTitle')}</ThemedText>
        <ThemedText style={{ color: theme.textSecondary }} type="small">
          {t('company.actingBody')}
        </ThemedText>
        <Choice
          label={t('company.personalLegacyProjects')}
          onPress={() => setActingCompanyId(null)}
          selected={!actingCompanyId}
        />
        {(companies ?? []).map(({ company, membership }) =>
          company ? (
            <Choice
              key={company._id}
              label={`${company.displayName} · ${roleLabel(membership.role, t)}${company.status !== "active" ? ` · ${statusLabel(company.status, t)}` : ""}`}
              onPress={() =>
                company.status === "active"
                  ? setActingCompanyId(company._id)
                  : Alert.alert(
                      t('company.suspendedTitle'),
                      t('company.suspendedBody'),
                    )
              }
              selected={company._id === actingCompanyId}
            />
          ) : null,
        )}

        {(companyInvitations ?? []).length ? (
          <Section title={t('company.invitations')}>
            {companyInvitations?.map(({ company, invitation }) => (
              <Invitation
                key={invitation._id}
                title={company?.displayName ?? t('company.companyFallback')}
                detail={t('company.invitationDetail', { role: roleLabel(invitation.role, t) })}
                accept={() =>
                  run(
                    () =>
                      decideCompanyInvitation({
                        invitationId: invitation._id,
                        decision: "accept",
                      }),
                    t('company.joinedCompany'),
                  )
                }
                decline={() =>
                  run(
                    () =>
                      decideCompanyInvitation({
                        invitationId: invitation._id,
                        decision: "decline",
                      }),
                    t('company.invitationDeclined'),
                  )
                }
              />
            ))}
          </Section>
        ) : null}

        {actingCompanyId && (relationshipInvitations ?? []).length ? (
          <Section title={t('company.relationshipInvitations')}>
            {relationshipInvitations?.map(
              ({ invitation, invitingCompany, relationship, participants }) => (
                <Invitation
                  key={invitation._id}
                  title={relationship?.name ?? t('company.relationshipFallback')}
                  detail={t('company.relationshipDetail', { company: invitingCompany?.displayName ?? t('company.companyFallback'), participants: participants.map((company) => company.displayName).join(', ') })}
                  accept={() =>
                    run(
                      () =>
                        decideRelationshipInvitation({
                          actingCompanyId,
                          invitationId: invitation._id,
                          decision: "accept",
                        }),
                      t('company.joinedRelationship'),
                    )
                  }
                  decline={() =>
                    run(
                      () =>
                        decideRelationshipInvitation({
                          actingCompanyId,
                          invitationId: invitation._id,
                          decision: "decline",
                        }),
                      t('company.invitationDeclined'),
                    )
                  }
                />
              ),
            )}
          </Section>
        ) : null}

        {actingCompanyId && trackUserId && (projectInvitations ?? []).length ? (
          <Section title={t('company.sharedProjectInvitations')}>
            {projectInvitations?.map(
              ({ invitation, invitingCompany, project }) => (
                <Invitation
                  key={invitation._id}
                  title={project?.name ?? t('company.sharedProjectFallback')}
                  detail={t('company.sharedProjectDetail', { company: invitingCompany?.displayName ?? t('company.companyFallback') })}
                  accept={() =>
                    run(
                      () =>
                        decideProjectInvitation({
                          actingCompanyId,
                          invitationId: invitation._id,
                          decision: "accept",
                          initialMembers: [
                            { userId: trackUserId, role: "manager" },
                          ],
                        }),
                      t('company.joinedProject'),
                    )
                  }
                  decline={() =>
                    run(
                      () =>
                        decideProjectInvitation({
                          actingCompanyId,
                          invitationId: invitation._id,
                          decision: "decline",
                          initialMembers: [],
                        }),
                      t('company.invitationDeclined'),
                    )
                  }
                />
              ),
            )}
          </Section>
        ) : null}

        {actingCompanyId ? (
          <Section title={t('company.relationships')}>
            {(relationships ?? []).map(({ relationship, participants }) => (
              <View
                key={relationship._id}
                style={[
                  styles.card,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText contentDirection="auto" type="smallBold">{relationship.name}</ThemedText>
                <ThemedText style={{ color: theme.textSecondary }} type="small">
                  {participants
                    .map((company) => company.displayName)
                    .join(" · ")}
                </ThemedText>
              </View>
            ))}
            <ThemedText style={{ color: theme.textSecondary }} type="small">
              {t('company.adminNote')}
            </ThemedText>
          </Section>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function Choice({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected
            ? theme.backgroundSelected
            : theme.backgroundElement,
        },
      ]}
    >
      <ThemedText contentDirection="auto" type="smallBold">
        {selected ? "✓ " : ""}
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {children}
    </View>
  );
}

function Invitation({
  accept,
  decline,
  detail,
  title,
}: {
  accept: () => void;
  decline: () => void;
  detail: string;
  title: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation('work');
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText contentDirection="auto" type="smallBold">{title}</ThemedText>
      <ThemedText contentDirection="auto" style={{ color: theme.textSecondary }} type="small">
        {detail}
      </ThemedText>
      <View style={styles.actions}>
        <Pressable
          onPress={accept}
          style={[styles.button, { backgroundColor: theme.text }]}
        >
          <ThemedText style={{ color: theme.background }} type="smallBold">
            {t('common.accept')}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={decline}
          style={[
            styles.button,
            { borderColor: theme.hairline, borderWidth: 1 },
          ]}
        >
          <ThemedText type="smallBold">{t('common.decline')}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function roleLabel(role: string, t: (key: string) => string) {
  const key = role === 'owner' ? 'company.roleOwner'
    : role === 'admin' ? 'company.roleAdmin'
      : role === 'staff' ? 'company.roleStaff'
        : role === 'manager' ? 'company.roleManager'
          : role === 'viewer' ? 'company.roleViewer'
            : role === 'guest' ? 'company.roleGuest'
              : role === 'member' ? 'company.roleMember'
                : 'company.roleUnknown';
  return t(key);
}

function statusLabel(status: string, t: (key: string) => string) {
  const key = status === 'suspended' ? 'company.statusSuspended'
    : status === 'archived' ? 'company.statusArchived'
      : status === 'active' ? 'company.statusActive'
        : 'company.statusUnknown';
  return t(key);
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: Spacing.two },
  button: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  card: { borderRadius: 10, gap: Spacing.two, padding: Spacing.three },
  choice: {
    borderRadius: 10,
    justifyContent: "center",
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  content: { gap: Spacing.three, padding: Spacing.three },
  empty: { gap: Spacing.two, padding: Spacing.four },
  screen: { flex: 1 },
  section: { gap: Spacing.two, marginTop: Spacing.three },
});
