import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../lib/hooks.js';
import { Card, EmptyState } from '../components/ui/index.js';

export default function NotFound() {
  useDocumentTitle('الصفحة مش موجودة');
  return (
    <div className="page">
      <Card>
        <EmptyState icon="compass" title="الصفحة دي مش موجودة" description="يمكن الرابط اتغيّر أو اتكتب غلط." action={<Link to="/" className="btn primary">للرئيسية</Link>} />
      </Card>
    </div>
  );
}
