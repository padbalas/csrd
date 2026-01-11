import { Navigate, useParams } from 'react-router-dom';
import Records from './Records';
import ScopeView from './ScopeView';

const ScopeRoute = () => {
  const { scopeId } = useParams();

  if (scopeId === 'scope2') {
    return <Records />;
  }

  if (scopeId === 'scope1' || scopeId === 'scope3') {
    return <ScopeView />;
  }

  return <Navigate to="/dashboard" replace />;
};

export default ScopeRoute;
