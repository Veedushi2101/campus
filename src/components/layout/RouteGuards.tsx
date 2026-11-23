import React from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import type {CoreMemberPermission} from '../../../shared/constants/permissions.ts';
import {useAuth, type WorkspaceContextType} from '../../context/AuthContext.tsx';

export const RequireAuthRoute: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {isAuthenticated} = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{from: location.pathname}} replace />;
  }
  return <>{children}</>;
};

export const RequireContextRoute: React.FC<{
  allowedContexts: WorkspaceContextType[];
  requiredPermission?: CoreMemberPermission;
  children: React.ReactNode;
}> = ({allowedContexts, requiredPermission, children}) => {
  const {isAuthenticated, activeContext, hasPermission} = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedContexts.includes(activeContext)) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
