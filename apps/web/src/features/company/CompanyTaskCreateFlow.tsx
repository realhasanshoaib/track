import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { TaskCreateDialog } from "#/features/tasks/TaskCreateDialog";

type ProjectPage = FunctionReturnType<typeof api.mobile.listProjects>["page"];

export function CompanyTaskCreateFlow({
  actingCompanyId,
  onOpenChange,
  open,
  projects,
}: {
  actingCompanyId: Id<"companies">;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projects: ProjectPage;
}) {
  const availableProjects = useMemo(
    () => Array.from(new Map(projects.map((item) => [item.project._id, item])).values()),
    [projects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "">("");
  const [showTaskForm, setShowTaskForm] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowTaskForm(false);
      return;
    }
    if (!availableProjects.some((item) => item.project._id === selectedProjectId)) {
      setSelectedProjectId(availableProjects[0]?.project._id ?? "");
    }
  }, [availableProjects, open, selectedProjectId]);

  const selectedProject = availableProjects.find(
    (item) => item.project._id === selectedProjectId,
  );
  const boards = useQuery(
    api.taskBoards.list,
    selectedProject
      ? {
          actingCompanyId,
          projectId: selectedProject.project._id,
          projectMemberId: selectedProject.membership._id,
        }
      : "skip",
  );

  if (showTaskForm && selectedProject) {
    return (
      <TaskCreateDialog
        boards={boards ?? []}
        identity={{
          actingCompanyId,
          projectMemberId: selectedProject.membership._id,
        }}
        onCreated={() => onOpenChange(false)}
        onOpenChange={onOpenChange}
        open={open}
        projectId={selectedProject.project._id}
      />
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="company-dashboard-dialog company-task-project-dialog">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Choose the Company project that will own this task.
          </DialogDescription>
        </DialogHeader>
        {availableProjects.length ? (
          <label className="company-task-project-field">
            <span>Project</span>
            <NativeSelect
              aria-label="Task project"
              onChange={(event) => setSelectedProjectId(event.target.value as Id<"projects">)}
              searchable={availableProjects.length >= 8}
              value={selectedProjectId}
            >
              {availableProjects.map((item) => (
                <NativeSelectOption key={item.project._id} value={item.project._id}>
                  {item.project.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <p className="company-global-work-empty">No writable projects are available.</p>
        )}
        <div className="company-task-project-actions">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!selectedProject} onClick={() => setShowTaskForm(true)} type="button">
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
