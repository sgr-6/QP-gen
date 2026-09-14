"use client";

import React, { useState, useEffect } from "react";
import { Plus, UserPlus, Settings, ShieldAlert, Loader2 } from "lucide-react";
import axios from "axios";

interface Tenant {
  id: string;
  name: string;
  orgCode: string;
  domain?: string;
  createdAt: string;
}

export default function SuperAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: "", orgCode: "" });
  const [creatingTenant, setCreatingTenant] = useState(false);

  const [assignAdminTenant, setAssignAdminTenant] = useState<Tenant | null>(null);
  const [adminForm, setAdminForm] = useState({ email: "", name: "" });
  const [assigningAdmin, setAssigningAdmin] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get("/api/super-admin/tenants");
      setTenants(res.data.tenants || res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingTenant(true);
      await axios.post("/api/super-admin/tenants", tenantForm);
      setIsCreateTenantOpen(false);
      setTenantForm({ name: "", orgCode: "" });
      fetchTenants();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create tenant");
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleAssignAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignAdminTenant) return;
    try {
      setAssigningAdmin(true);
      await axios.post(`/api/super-admin/tenants/${assignAdminTenant.id}/admin`, adminForm);
      setAssignAdminTenant(null);
      setAdminForm({ email: "", name: "" });
      alert("Admin assigned successfully!");
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to assign admin");
    } finally {
      setAssigningAdmin(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <ShieldAlert className="h-8 w-8 text-indigo-600" />
              Super Admin Portal
            </h1>
            <p className="text-gray-500 mt-1">Manage global tenants and platform settings.</p>
          </div>
          <button
            onClick={() => setIsCreateTenantOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create Tenant
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500 uppercase tracking-wider">
                    <th className="p-4">Tenant Name</th>
                    <th className="p-4">Org Code</th>
                    <th className="p-4">Domain</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50 transition">
                      <td className="p-4 font-medium text-gray-900">{tenant.name}</td>
                      <td className="p-4 text-gray-600">
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-mono">
                          {tenant.orgCode}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">{tenant.domain || "-"}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setAssignAdminTenant(tenant)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                        >
                          <UserPlus className="h-4 w-4" />
                          Assign Admin
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">
                        No tenants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Tenant Modal */}
      {isCreateTenantOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Create New Tenant</h2>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  placeholder="e.g. Stanford University"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Org Code</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={tenantForm.orgCode}
                  onChange={(e) => setTenantForm({ ...tenantForm, orgCode: e.target.value })}
                  placeholder="e.g. STANFORD"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateTenantOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTenant}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {creatingTenant && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Admin Modal */}
      {assignAdminTenant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              Assign Admin: {assignAdminTenant.name}
            </h2>
            <form onSubmit={handleAssignAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setAssignAdminTenant(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningAdmin}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {assigningAdmin && <Loader2 className="h-4 w-4 animate-spin" />}
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
