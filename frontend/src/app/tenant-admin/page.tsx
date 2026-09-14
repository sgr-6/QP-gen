"use client";

import React, { useState, useEffect } from "react";
import { Users, Settings, Plus, Loader2, Save, UserCog, Unlock } from "lucide-react";
import axios from "axios";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status?: string;
}

interface TenantSettings {
  name: string;
  orgCode: string;
  domain: string;
  logoUrl: string;
}

export default function TenantAdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "settings">("users");

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: "professor", department: "" });
  const [addingUser, setAddingUser] = useState(false);

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState("");
  const [updatingRole, setUpdatingRole] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<TenantSettings>({ name: "", orgCode: "", domain: "", logoUrl: "" });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    } else {
      fetchSettings();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      setUsersError(null);
      const res = await axios.get("/api/tenant-admin/users");
      setUsers(res.data.users || res.data);
    } catch (err: any) {
      setUsersError(err.response?.data?.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setSettingsLoading(true);
      setSettingsError(null);
      const res = await axios.get("/api/tenant-admin/settings");
      setSettings(res.data.settings || res.data);
    } catch (err: any) {
      setSettingsError(err.response?.data?.message || "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAddingUser(true);
      await axios.post("/api/tenant-admin/users", userForm);
      setIsAddUserOpen(false);
      setUserForm({ name: "", email: "", role: "professor", department: "" });
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to add user");
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      setUpdatingRole(true);
      await axios.put(`/api/tenant-admin/users/${editUser.id}/role`, { role: editRole });
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleUnlockUser = async (userId: string) => {
    try {
      await axios.put(`/api/tenant-admin/users/${userId}`, { status: 'active' });
      alert("Account unlocked successfully");
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to unlock account");
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdatingSettings(true);
      setSettingsError(null);
      setSettingsSuccess(false);
      await axios.put("/api/tenant-admin/settings", settings);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err: any) {
      setSettingsError(err.response?.data?.message || "Failed to update settings");
    } finally {
      setUpdatingSettings(false);
    }
  };

  const roles = [
    { value: "professor", label: "Professor" },
    { value: "hod", label: "Head of Department (HOD)" },
    { value: "controller_of_exams", label: "Controller of Exams" },
    { value: "tenant_admin", label: "Tenant Admin" }
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-8 pt-8 pb-0">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6">
            Tenant Administration
          </h1>
          <div className="flex gap-6 -mb-px">
            <button
              onClick={() => setActiveTab("users")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === "users"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } flex items-center gap-2`}
            >
              <Users className="h-4 w-4" />
              User Management
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === "settings"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } flex items-center gap-2`}
            >
              <Settings className="h-4 w-4" />
              Tenant Settings
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {activeTab === "users" ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Users</h2>
              <button
                onClick={() => setIsAddUserOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition flex items-center gap-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                Add User
              </button>
            </div>

            {usersError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-sm">
                {usersError}
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {usersLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Name</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Department</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 transition text-sm">
                          <td className="p-4 font-medium text-gray-900">{user.name}</td>
                          <td className="p-4 text-gray-600">{user.email}</td>
                          <td className="p-4">
                            <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-xs font-medium capitalize">
                              {user.role.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="p-4 text-gray-600">{user.department || "-"}</td>
                          <td className="p-4">
                            {user.status === "locked" ? (
                              <span className="bg-red-50 text-red-700 px-2 py-1 rounded-md text-xs font-medium">Locked</span>
                            ) : (
                              <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md text-xs font-medium">Active</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => {
                                setEditUser(user);
                                setEditRole(user.role);
                              }}
                              className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-800 transition mr-4"
                            >
                              <UserCog className="h-4 w-4" />
                              Change Role
                            </button>
                            {user.status === "locked" && (
                              <button
                                onClick={() => handleUnlockUser(user.id)}
                                className="inline-flex items-center gap-1.5 font-medium text-green-600 hover:text-green-800 transition"
                              >
                                <Unlock className="h-4 w-4" />
                                Unlock
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                            No users found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Tenant Configuration</h2>
              <p className="text-sm text-gray-500 mt-1">Update your organization's details and branding.</p>
            </div>
            
            <div className="p-6">
              {settingsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <form onSubmit={handleUpdateSettings} className="space-y-6">
                  {settingsError && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-sm">
                      {settingsError}
                    </div>
                  )}
                  {settingsSuccess && (
                    <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-200 text-sm">
                      Settings updated successfully.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        value={settings.name}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization Code</label>
                      <input
                        type="text"
                        required
                        disabled
                        className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
                        value={settings.orgCode}
                        title="Organization code cannot be changed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Domain (Optional)</label>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        value={settings.domain || ""}
                        onChange={(e) => setSettings({ ...settings, domain: e.target.value })}
                        placeholder="e.g. stanford.edu"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL (Optional)</label>
                      <input
                        type="url"
                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        value={settings.logoUrl || ""}
                        onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={updatingSettings}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2 text-sm"
                    >
                      {updatingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Changes
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add New User</h2>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="jane@example.edu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  {roles.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department (Optional)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={userForm.department}
                  onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                  placeholder="Computer Science"
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="bg-indigo-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {addingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Change Role</h2>
              <p className="text-sm text-gray-500 mt-1">Update role for {editUser.name}</p>
            </div>
            <form onSubmit={handleUpdateRole} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Role</label>
                <select
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  {roles.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingRole}
                  className="bg-indigo-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingRole && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
