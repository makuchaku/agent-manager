import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../store/app-store";
import type { Project } from "../../store/types";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./Sidebar.module.css";

interface BranchInfo {
  name: string;
  isRemote: boolean;
}

export function Sidebar() {
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const addProject = useAppStore((s) => s.addProject);
  const addTab = useAppStore((s) => s.addTab);
  const addToast = useAppStore((s) => s.addToast);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const confirmDialog = useAppStore((s) => s.confirmDialog);
  const showConfirmDialog = useAppStore((s) => s.showConfirmDialog);
  const dismissConfirmDialog = useAppStore((s) => s.dismissConfirmDialog);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const toggleAutomations = useAppStore((s) => s.toggleAutomations);
  const unreadProjectIds = useAppStore((s) => s.unreadProjectIds);
  const activeAgentProjectIds = useAppStore((s) => s.activeAgentProjectIds);
  const updateProject = useAppStore((s) => s.updateProject);
  const checkoutBranch = useAppStore((s) => s.checkoutBranch);
  const createBranch = useAppStore((s) => s.createBranch);
  const setPrStatuses = useAppStore((s) => s.setPrStatuses);
  const setGhAvailability = useAppStore((s) => s.setGhAvailability);

  const [manualCollapsed, setManualCollapsed] = useState<Set<string>>(new Set());
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectBranches, setProjectBranches] = useState<Record<string, BranchInfo[]>>({});
  const [branchesLoading, setBranchesLoading] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showNewBranchInput, setShowNewBranchInput] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");

  const isProjectExpanded = useCallback(
    (id: string) => !manualCollapsed.has(id),
    [manualCollapsed]
  );

  const toggleProject = useCallback((id: string) => {
    setManualCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loadBranches = useCallback(async (project: Project) => {
    setBranchesLoading((prev) => ({ ...prev, [project.id]: true }));
    try {
      const branches = await window.api.git.getBranches(project.repoPath);
      setProjectBranches((prev) => ({
        ...prev,
        [project.id]: branches.map((b: string) => ({
          name: b,
          isRemote: b.startsWith("origin/"),
        })).sort((a: BranchInfo, b: BranchInfo) => {
          if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
          return a.name.localeCompare(b.name);
        }),
      }));
    } catch (err) {
      console.error("Failed to load branches:", err);
    } finally {
      setBranchesLoading((prev) => ({ ...prev, [project.id]: false }));
    }
  }, []);

  const handleAddProject = useCallback(async () => {
    const dirPath = await window.api.app.selectDirectory();
    if (!dirPath) return;

    const name = dirPath.split("/").pop() || dirPath;
    const id = crypto.randomUUID();

    let branch = "";
    try {
      branch = await window.api.git.getCurrentBranch(dirPath);
    } catch {
      branch = "main";
    }

    addProject({ id, name, repoPath: dirPath, branch });
    
    const ptyId = await window.api.pty.create(dirPath, undefined, {
      AGENT_ORCH_PROJECT_ID: id,
    });
    addTab({
      id: crypto.randomUUID(),
      projectId: id,
      type: "terminal",
      title: "Terminal",
      ptyId,
    });

    setActiveProject(id);
    loadBranches({ id, name, repoPath: dirPath, branch });
  }, [addProject, addTab, setActiveProject, loadBranches]);

  const handleSelectProject = useCallback((projectId: string) => {
    setActiveProject(projectId);
    const project = projects.find((p) => p.id === projectId);
    if (project && !projectBranches[projectId]) {
      loadBranches(project);
    }
  }, [setActiveProject, projects, projectBranches, loadBranches]);

  const handleCheckoutBranch = useCallback(async (projectId: string, branchName: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    
    await checkoutBranch(projectId, branchName);
    
    setProjectBranches((prev) => {
      const branches = prev[projectId] || [];
      return {
        ...prev,
        [projectId]: branches.map((b: BranchInfo) => ({
          ...b,
          name: b.name === branchName ? branchName : b.name,
        })),
      };
    });
  }, [checkoutBranch, projects]);

  const handleCreateBranch = useCallback(async (projectId: string) => {
    if (!newBranchName.trim()) {
      setShowNewBranchInput(null);
      return;
    }

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const baseBranch = project.branch || "main";
    await createBranch(projectId, newBranchName.trim(), baseBranch);
    
    await handleCheckoutBranch(projectId, newBranchName.trim());
    
    setNewBranchName("");
    setShowNewBranchInput(null);
    loadBranches(project);
  }, [newBranchName, projects, createBranch, handleCheckoutBranch, loadBranches]);

  const handleDeleteProject = useCallback(
    (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      showConfirmDialog({
        title: "Delete Project",
        message: `Delete project "${project.name}" from the app? The git repository will remain on disk.`,
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: () => {
          deleteProject(project.id);
          dismissConfirmDialog();
        },
      });
    },
    [showConfirmDialog, deleteProject, dismissConfirmDialog]
  );

  return (
    <div className={styles.sidebar}>
      <div className={styles.titleArea} />

      <div className={styles.projectList}>
        {projects.length === 0 && (
          <div className={styles.emptyState}>
            <span
              style={{
                color: "var(--text-tertiary)",
                fontSize: "var(--text-sm)",
                padding: "0 var(--space-6)",
              }}
            >
              No projects yet. Add a git repository to get started.
            </span>
          </div>
        )}

        {projects.map((project) => {
          const isExpanded = isProjectExpanded(project.id);
          const branches = projectBranches[project.id] || [];
          const isLoading = branchesLoading[project.id];
          const isCurrentlyExpanded = expandedProjects.has(project.id);

          return (
            <div key={project.id} className={styles.projectSection}>
              <div
                className={styles.projectHeader}
                onClick={() => toggleProject(project.id)}
              >
                <span
                  className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}
                >
                  ▶
                </span>
                <span className={styles.projectName}>{project.name}</span>
                <Tooltip label="Project settings">
                  <button
                    className={styles.settingsBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProject(project);
                    }}
                  >
                    ⚙
                  </button>
                </Tooltip>
                <Tooltip label="Delete project">
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDeleteProject(e, project)}
                  >
                    ✕
                  </button>
                </Tooltip>
              </div>

              {isExpanded && (
                <div className={styles.workspaceList}>
                  <div
                    className={`${styles.workspaceItem} ${
                      project.id === activeProjectId ? styles.active : ""
                    } ${unreadProjectIds.has(project.id) ? styles.unread : ""} ${
                      activeAgentProjectIds.has(project.id) ? styles.claudeActive : ""
                    }`}
                    onClick={() => handleSelectProject(project.id)}
                  >
                    <span className={styles.workspaceIcon}>~</span>
                    <div className={styles.workspaceNameCol}>
                      <span className={styles.workspaceName}>
                        {project.branch || "main"}
                      </span>
                    </div>
                  </div>

                  <button
                    className={styles.actionButton}
                    style={{ paddingLeft: "var(--space-4)" }}
                    onClick={() => {
                      const newSet = new Set(expandedProjects);
                      if (isCurrentlyExpanded) {
                        newSet.delete(project.id);
                      } else {
                        newSet.add(project.id);
                        if (!projectBranches[project.id]) {
                          loadBranches(project);
                        }
                      }
                      setExpandedProjects(newSet);
                    }}
                  >
                    <span className={styles.actionIcon}>
                      {isCurrentlyExpanded ? "▼" : "▶"}
                    </span>
                    <span>Branches {isLoading && "(loading...)"}</span>
                  </button>

                  {isCurrentlyExpanded && (
                    <div style={{ paddingLeft: "var(--space-4)" }}>
                      {branches.filter((b: BranchInfo) => !b.isRemote).map((branch: BranchInfo) => (
                        <div
                          key={branch.name}
                          className={`${styles.workspaceItem} ${
                            project.branch === branch.name ? styles.active : ""
                          }`}
                          onClick={() => {
                            if (project.branch !== branch.name) {
                              handleCheckoutBranch(project.id, branch.name);
                            }
                          }}
                        >
                          <span className={styles.workspaceIcon}>
                            {project.branch === branch.name ? "✓" : " "}
                          </span>
                          <span className={styles.workspaceName}>{branch.name}</span>
                        </div>
                      ))}

                      {branches.filter((b: BranchInfo) => b.isRemote).length > 0 && (
                        <>
                          <div
                            style={{
                              fontSize: "var(--text-xs)",
                              color: "var(--text-tertiary)",
                              padding: "var(--space-2) 0",
                            }}
                          >
                            Remote branches
                          </div>
                          {branches
                            .filter((b: BranchInfo) => b.isRemote)
                            .map((branch: BranchInfo) => (
                              <div
                                key={branch.name}
                                className={styles.workspaceItem}
                                onClick={() => {
                                  const localName = branch.name.replace(/^origin\//, "");
                                  handleCreateBranch(project.id);
                                }}
                              >
                                <span className={styles.workspaceIcon}> </span>
                                <span className={styles.workspaceName}>{branch.name}</span>
                              </div>
                            ))}
                        </>
                      )}

                      {showNewBranchInput === project.id ? (
                        <div style={{ padding: "var(--space-2)" }}>
                          <input
                            className={styles.workspaceNameInput}
                            placeholder="branch name"
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleCreateBranch(project.id);
                              } else if (e.key === "Escape") {
                                setShowNewBranchInput(null);
                                setNewBranchName("");
                              }
                            }}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          className={styles.actionButton}
                          style={{ paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)" }}
                          onClick={() => setShowNewBranchInput(project.id)}
                        >
                          <span className={styles.actionIcon}>+</span>
                          <span>New branch</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <Tooltip label="Add project">
          <button className={styles.actionButton} onClick={handleAddProject}>
            <span className={styles.actionIcon}>+</span>
            <span>Add project</span>
          </button>
        </Tooltip>
        <Tooltip label="Automations">
          <button className={styles.actionButton} onClick={toggleAutomations}>
            <span className={styles.actionIcon}>⏱</span>
            <span>Automations</span>
          </button>
        </Tooltip>
        <Tooltip label="Settings" shortcut="⌘,">
          <button className={styles.actionButton} onClick={toggleSettings}>
            <span className={styles.actionIcon}>⚙</span>
            <span>Settings</span>
          </button>
        </Tooltip>
      </div>

      {editingProject && (
        <ProjectSettingsDialog
          project={editingProject}
          onSave={({ startupCommands, prLinkProvider }) => {
            updateProject(editingProject.id, {
              startupCommands,
              prLinkProvider,
            });
            setEditingProject(null);
          }}
          onCancel={() => setEditingProject(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={dismissConfirmDialog}
        />
      )}
    </div>
  );
}
