import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      className="mt-10"
      icon={<Compass className="h-5 w-5" />}
      title="Page not found"
      description="That page doesn’t exist. It may have been a link to a deck that was deleted."
      action={<Button onClick={() => navigate('/')}>Go to dashboard</Button>}
    />
  );
}
