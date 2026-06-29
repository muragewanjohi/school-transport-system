"use client";

import React from "react";
import { useAuth } from "@/components/AuthProvider";

interface UserProfileBadgeProps {
  nameOverride?: string;
  roleOverride?: string;
  initialsOverride?: string;
}

export default function UserProfileBadge({ nameOverride, roleOverride, initialsOverride }: UserProfileBadgeProps) {
  const { profile } = useAuth();

  if (!profile && !nameOverride) return null;

  const displayName = nameOverride || profile?.name || "Unknown User";
  const displayRole = roleOverride || profile?.admin_role || "Administrator";
  const displayInitials = initialsOverride || (profile 
    ? profile.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) 
    : displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  );

  return (
    <div className="user-profile">
      <div className="profile-avatar" style={{
        background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
        color: "white",
        fontWeight: 600
      }}>
        {displayInitials}
      </div>
      <div>
        <span className="profile-name">{displayName}</span>
        <span className="profile-role">{displayRole}</span>
      </div>
    </div>
  );
}
