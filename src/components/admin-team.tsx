"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  Check,
  Plus,
  ShieldCheck,
  Trash,
  UserCheck,
  UserCircle,
  UserPlus,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { getWhatsAppChatUrl } from "@/lib/notifications";

export type AdminTeamMember = {
  id: string;
  userId: string | null;
  phone: string;
  name: string;
  role: "super_admin" | "kitchen_manager" | "dispatch_lead";
  status: "active" | "pending_signin";
  createdAt: string;
  isCurrentUser: boolean;
};

const roleLabels: Record<AdminTeamMember["role"], { label: string; desc: string }> = {
  super_admin: { label: "Super Admin", desc: "Full access to all menus, settings, finances, and team operations" },
  kitchen_manager: { label: "Kitchen Manager", desc: "Access to today's batches, kitchen preparation, and pack stickers" },
  dispatch_lead: { label: "Dispatch Lead", desc: "Access to active deliveries, rider dispatch, and campus rerouting" },
};

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return raw;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeZone: "Africa/Lagos",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function AdminTeam() {
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Add modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [roleInput, setRoleInput] = useState<AdminTeamMember["role"]>("super_admin");
  const [saving, setSaving] = useState(false);

  // Remove modal state
  const [removeTarget, setRemoveTarget] = useState<AdminTeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/team", { cache: "no-store" });
      const data = (await response.json()) as { members?: AdminTeamMember[]; error?: string };

      if (!response.ok) {
        setError(data.error ?? "Failed to load admin team members.");
      } else {
        setMembers(data.members ?? []);
      }
    } catch {
      setError("Could not connect to admin team service. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleAddAdmin(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nameInput.trim(),
          phone: phoneInput.trim(),
          role: roleInput,
        }),
      });

      const data = (await response.json()) as { success?: boolean; member?: AdminTeamMember; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not add admin team member.");
      }

      setNotice(`Admin access granted to ${phoneInput}. They can now sign in at /admin.`);
      setAddModalOpen(false);
      setNameInput("");
      setPhoneInput("");
      setRoleInput("super_admin");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add admin member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveAdmin() {
    if (!removeTarget) return;
    setRemoving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/team?id=${removeTarget.id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove admin member.");
      }

      setNotice(`Revoked admin access for ${removeTarget.name} (${removeTarget.phone}).`);
      setRemoveTarget(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove admin member.");
    } finally {
      setRemoving(false);
    }
  }

  function getInviteWhatsappUrl(member: AdminTeamMember) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://prechop.com.ng";
    const msg = `👋 Hi ${member.name.split(" ")[0]}!\n\nYou have been granted PreChop Admin access (${roleLabels[member.role].label}).\n\nYou can sign in anytime using your phone number at:\n${origin}/admin`;
    return getWhatsAppChatUrl(member.phone, msg);
  }

  return (
    <section className="admin-section admin-team-section">
      <div className="admin-team-header">
        <div>
          <span className="eyebrow">ACCESS & ROLES</span>
          <h2>Admin team</h2>
          <p>Manage authorized administrator phone numbers, invite staff, or switch login numbers safely.</p>
        </div>
        <div className="admin-team-actions">
          <button
            type="button"
            className="admin-refresh"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
          >
            <ArrowClockwise size={16} className={refreshing ? "admin-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="admin-module-primary"
            onClick={() => {
              setAddModalOpen(true);
              setError("");
            }}
          >
            <UserPlus size={16} />
            Add team member
          </button>
        </div>
      </div>

      {notice && (
        <p className="admin-action-notice">
          <Check size={18} /> {notice}
        </p>
      )}

      {error && (
        <p className="error admin-report-error" role="alert">
          {error}
        </p>
      )}

      {/* Guide Banner for Switching Phone Numbers */}
      <div className="admin-team-guide-banner">
        <div className="admin-team-guide-left">
          <ShieldCheck size={28} weight="fill" className="admin-team-shield-icon" />
          <div>
            <strong>Need to switch your admin phone number?</strong>
            <p>
              Click <strong>Add team member</strong>, enter your new phone number, log in to verify access, and then remove your old number. Your admin access transfers smoothly with zero risk of being locked out.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="admin-action-button"
          onClick={() => {
            setAddModalOpen(true);
            setError("");
          }}
        >
          <Plus size={14} /> Add new number
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="admin-team-metrics">
        <div>
          <span>Total Admin Accounts</span>
          <strong>{loading ? "—" : members.length}</strong>
        </div>
        <div>
          <span>Active Logged-in</span>
          <strong>{loading ? "—" : members.filter((m) => m.status === "active").length}</strong>
        </div>
        <div>
          <span>Pending First Login</span>
          <strong>{loading ? "—" : members.filter((m) => m.status === "pending_signin").length}</strong>
        </div>
      </div>

      {/* Members Table */}
      {loading ? (
        <div className="admin-module-loading">
          <span />
          <span />
          <span />
        </div>
      ) : members.length === 0 ? (
        <div className="admin-module-empty">
          <h3>No admin accounts found.</h3>
          <p>Add an admin account to manage operations.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-batches-table admin-module-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Phone Number</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="admin-team-member-name">
                      <div className="admin-team-avatar">
                        <UserCircle size={24} weight="light" />
                      </div>
                      <div>
                        <strong>{member.name}</strong>
                        {member.isCurrentUser && (
                          <span className="admin-team-you-badge">You</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong style={{ fontFamily: "monospace", fontSize: "13px" }}>
                      {formatPhoneDisplay(member.phone)}
                    </strong>
                  </td>
                  <td>
                    <span className={`admin-team-role-tag ${member.role}`}>
                      {roleLabels[member.role].label}
                    </span>
                  </td>
                  <td>
                    {member.status === "active" ? (
                      <span className="admin-team-status is-active">
                        <UserCheck size={13} weight="bold" /> Active
                      </span>
                    ) : (
                      <span className="admin-team-status is-pending" title="Pre-approved: becomes Active upon first Phone OTP login">
                        Pending login
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: "12.5px", color: "var(--admin-muted)" }}>
                      {formatDate(member.createdAt)}
                    </span>
                  </td>
                  <td>
                    <div className="admin-team-row-actions">
                      {member.status === "pending_signin" && (
                        <a
                          href={getInviteWhatsappUrl(member)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-team-invite-btn"
                          title="Send sign-in link via WhatsApp"
                        >
                          <WhatsappLogo size={15} weight="fill" /> Send Invite
                        </a>
                      )}
                      <button
                        type="button"
                        className="admin-team-remove-btn"
                        disabled={member.isCurrentUser && members.length <= 1}
                        title={
                          member.isCurrentUser && members.length <= 1
                            ? "Cannot remove the only admin"
                            : "Revoke admin access"
                        }
                        onClick={() => setRemoveTarget(member)}
                      >
                        <Trash size={14} /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      {addModalOpen && (
        <div
          className="admin-module-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setAddModalOpen(false);
          }}
        >
          <div className="admin-module-modal admin-team-modal" role="dialog" aria-modal="true" aria-labelledby="add-team-title">
            <div>
              <span className="eyebrow">ACCESS MANAGEMENT</span>
              <button
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={() => setAddModalOpen(false)}
              >
                <X size={18} />
              </button>
              <h2 id="add-team-title">Add admin team member</h2>
            </div>

            <form onSubmit={(e) => void handleAddAdmin(e)}>
              <label>
                Member Name or Label
                <input
                  type="text"
                  required
                  placeholder="e.g. Jay (New SIM) or Halima"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </label>

              <label>
                Nigerian Mobile Phone Number
                <input
                  type="tel"
                  required
                  placeholder="0803 123 4567 or +234..."
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
                <small className="admin-field-help">
                  Enter an 11-digit mobile number. They will use this number to receive verification OTPs.
                </small>
              </label>

              <label>
                Permission Role
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value as AdminTeamMember["role"])}
                >
                  <option value="super_admin">Super Admin — Full operations, menu planning, settings & finance</option>
                  <option value="kitchen_manager">Kitchen Manager — Today&apos;s batches, cooking & stickers</option>
                  <option value="dispatch_lead">Dispatch Lead — Deliveries, order dispatch & customer reroutes</option>
                </select>
              </label>

              <div className="admin-team-modal-note">
                <strong>Instant Access:</strong> If this phone number is already registered on PreChop, they receive admin access immediately. If new, they can sign in anytime at <code>/admin</code> to activate their account.
              </div>

              <div className="admin-module-modal-actions">
                <button
                  type="button"
                  className="admin-refresh"
                  disabled={saving}
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-module-primary"
                  disabled={saving}
                >
                  <UserPlus size={16} />
                  {saving ? "Granting access..." : "Grant Admin Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeTarget && (
        <div
          className="admin-module-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !removing) setRemoveTarget(null);
          }}
        >
          <div className="admin-module-modal admin-team-modal" role="dialog" aria-modal="true" aria-labelledby="remove-team-title">
            <div>
              <span className="eyebrow" style={{ color: "#ba3c11" }}>REVOKE ACCESS</span>
              <button
                type="button"
                aria-label="Close"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
              >
                <X size={18} />
              </button>
              <h2 id="remove-team-title">Revoke admin access?</h2>
            </div>

            <div style={{ margin: "16px 0", fontSize: "14px", lineHeight: "1.5", color: "#4b463e" }}>
              <p>
                Are you sure you want to revoke admin access for:
              </p>
              <div style={{ padding: "12px 14px", background: "#fff5f0", border: "1px solid #fbd0be", borderRadius: "6px", margin: "12px 0" }}>
                <strong>{removeTarget.name}</strong>
                <div style={{ fontSize: "13px", color: "#8c2a05", fontFamily: "monospace", marginTop: "4px" }}>
                  {formatPhoneDisplay(removeTarget.phone)}
                </div>
              </div>
              <p style={{ fontSize: "13px", color: "var(--admin-muted)" }}>
                This phone number will immediately lose access to the PreChop admin portal and operations.
              </p>
            </div>

            <div className="admin-module-modal-actions">
              <button
                type="button"
                className="admin-refresh"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-module-primary"
                style={{ background: "#ba3c11", borderColor: "#ba3c11" }}
                disabled={removing}
                onClick={() => void handleRemoveAdmin()}
              >
                <Trash size={16} />
                {removing ? "Revoking access..." : "Revoke Admin Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
