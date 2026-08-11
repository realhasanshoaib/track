import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

type AsyncAction = (action: () => Promise<unknown>) => Promise<void>;

export function CreateCompanyForm({ run }: { run: AsyncAction }) {
  const { t } = useTranslation("company");
  const createCompany = useMutation(api.companies.create);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createCompany({ displayName, handle });
      setDisplayName("");
      setHandle("");
    });
  }

  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => void submit(event)}
    >
      <div>
        <Label htmlFor="company-name">{t("forms.createCompany.name")}</Label>
        <Input
          dir="auto"
          id="company-name"
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </div>
      <div>
        <Label htmlFor="company-handle">
          {t("forms.createCompany.privateHandle")}
        </Label>
        <Input
          autoCapitalize="none"
          dir="ltr"
          id="company-handle"
          onChange={(event) => setHandle(event.target.value)}
          required
          value={handle}
        />
      </div>
      <Button type="submit">{t("forms.createCompany.submit")}</Button>
    </form>
  );
}

export function InviteMemberForm({
  actingCompanyId,
  run,
}: {
  actingCompanyId: Id<"companies">;
  run: AsyncAction;
}) {
  const { t } = useTranslation("company");
  const invite = useMutation(api.companies.inviteMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await invite({ companyId: actingCompanyId, email, role });
          setEmail("");
        });
      }}
    >
      <div>
        <Label htmlFor="member-email">{t("forms.invite.email")}</Label>
        <Input
          dir="ltr"
          id="member-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div>
        <Label htmlFor="member-role">{t("forms.invite.role")}</Label>
        <select
          id="member-role"
          onChange={(event) =>
            setRole(event.target.value as "admin" | "member")
          }
          value={role}
        >
          <option value="member">{t("roles.member")}</option>
          <option value="admin">{t("roles.admin")}</option>
        </select>
      </div>
      <Button type="submit">{t("forms.invite.submit")}</Button>
    </form>
  );
}

export function CompanyProfileForm({
  actingCompanyId,
  displayName: initialDisplayName,
  run,
}: {
  actingCompanyId: Id<"companies">;
  displayName: string;
  run: AsyncAction;
}) {
  const { t } = useTranslation("company");
  const updateProfile = useMutation(api.companies.updateProfile);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => updateProfile({ companyId: actingCompanyId, displayName }));
      }}
    >
      <div>
        <Label htmlFor="company-profile-name">
          {t("forms.profile.displayName")}
        </Label>
        <Input dir="auto" id="company-profile-name" onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
      </div>
      <Button type="submit">{t("forms.profile.submit")}</Button>
    </form>
  );
}

export function RelationshipForm({
  actingCompanyId,
  run,
}: {
  actingCompanyId: Id<"companies">;
  run: AsyncAction;
}) {
  const { t } = useTranslation("company");
  const createRelationship = useMutation(api.relationships.create);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const match = useQuery(
    api.companies.discoverExact,
    handle.length >= 3 ? { actingCompanyId, handle } : "skip",
  );
  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!match) return;
        void run(async () => {
          await createRelationship({
            actingCompanyId,
            name,
            targetCompanyId: match._id,
          });
          setName("");
          setHandle("");
        });
      }}
    >
      <div>
        <Label htmlFor="relationship-name">
          {t("forms.relationship.name")}
        </Label>
        <Input
          dir="auto"
          id="relationship-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div>
        <Label htmlFor="target-handle">
          {t("forms.relationship.exactHandle")}
        </Label>
        <Input
          autoCapitalize="none"
          dir="ltr"
          id="target-handle"
          onChange={(event) => setHandle(event.target.value)}
          required
          value={handle}
        />
        <span className="company-field-hint">
          {match
            ? <><span dir="auto">{match.displayName}</span> · <span dir="ltr">@{match.normalizedHandle}</span></>
            : handle.length >= 3
              ? t("forms.relationship.noMatch")
              : t("forms.relationship.noDirectory")}
        </span>
      </div>
      <Button disabled={!match} type="submit">
        {t("forms.relationship.submit")}
      </Button>
    </form>
  );
}

export function RelationshipParticipantForm({
  actingCompanyId,
  relationshipId,
  run,
}: {
  actingCompanyId: Id<"companies">;
  relationshipId: Id<"relationships">;
  run: AsyncAction;
}) {
  const { t } = useTranslation("company");
  const inviteCompany = useMutation(api.relationships.inviteCompany);
  const [handle, setHandle] = useState("");
  const match = useQuery(
    api.companies.discoverExact,
    handle.length >= 3 ? { actingCompanyId, handle } : "skip",
  );
  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!match) return;
        void run(async () => {
          await inviteCompany({
            actingCompanyId,
            relationshipId,
            targetCompanyId: match._id,
          });
          setHandle("");
        });
      }}
    >
      <div>
        <Label htmlFor={`relationship-participant-${relationshipId}`}>
          {t("forms.relationshipParticipant.exactHandle")}
        </Label>
        <Input
          autoCapitalize="none"
          dir="ltr"
          id={`relationship-participant-${relationshipId}`}
          onChange={(event) => setHandle(event.target.value)}
          value={handle}
        />
        <span className="company-field-hint">
          {match
            ? <><span dir="auto">{match.displayName}</span> · <span dir="ltr">@{match.normalizedHandle}</span></>
            : t("forms.relationshipParticipant.noDirectory")}
        </span>
      </div>
      <Button disabled={!match} type="submit">
        {t("forms.relationshipParticipant.submit")}
      </Button>
    </form>
  );
}

export function SharedProjectForm({
  actingCompanyId,
  currentUserId,
  relationships,
  run,
}: {
  actingCompanyId: Id<"companies">;
  currentUserId: Id<"users">;
  relationships: Array<{
    relationship: Doc<"relationships">;
    participants: Array<{ _id: Id<"companies">; displayName: string }>;
  }>;
  run: AsyncAction;
}) {
  const { t } = useTranslation("company");
  const propose = useMutation(api.sharedProjects.propose);
  const [name, setName] = useState("");
  const [relationshipId, setRelationshipId] = useState<
    Id<"relationships"> | ""
  >("");
  const selected = relationships.find(
    (item) => item.relationship._id === relationshipId,
  );
  const targets =
    selected?.participants.filter(
      (company) => company._id !== actingCompanyId,
    ) ?? [];
  return (
    <form
      className="company-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!relationshipId || targets.length === 0) return;
        void run(async () => {
          await propose({
            actingCompanyId,
            initialMembers: [{ userId: currentUserId, role: "manager" }],
            name,
            relationshipId,
            targetCompanyIds: targets.map((company) => company._id),
          });
          setName("");
        });
      }}
    >
      <div>
        <Label htmlFor="shared-project-name">
          {t("forms.sharedProject.name")}
        </Label>
        <Input
          dir="auto"
          id="shared-project-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div>
        <Label htmlFor="shared-project-relationship">
          {t("forms.sharedProject.relationship")}
        </Label>
        <select
          id="shared-project-relationship"
          onChange={(event) =>
            setRelationshipId(event.target.value as Id<"relationships">)
          }
          required
          value={relationshipId}
        >
          <option value="">{t("forms.sharedProject.selectRelationship")}</option>
          {relationships.map((item) => (
            <option key={item.relationship._id} value={item.relationship._id}>
              {item.relationship.name}
            </option>
          ))}
        </select>
        <span className="company-field-hint">
          {targets.length
            ? <span dir="auto">{t("forms.sharedProject.invites", {
                companies: targets.map((company) => company.displayName).join(", "),
              })}</span>
            : t("forms.sharedProject.chooseActive")}
        </span>
      </div>
      <Button disabled={!relationshipId || targets.length === 0} type="submit">
        {t("forms.sharedProject.submit")}
      </Button>
    </form>
  );
}
