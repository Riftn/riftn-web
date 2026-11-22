/**
 * A creator's stream pet on their profile. Renders nothing for someone without
 * a pet, or who chose to keep it off their profile.
 */
import { useQuery } from '@tanstack/react-query';
import { getCreatorPet } from '@/lib/api/dehub/stream-pet';
import { PetCard } from './PetCard';

export default function ProfilePetCard({ address, own, className }: { address?: string | null; own?: boolean; className?: string }) {
  const { data } = useQuery({
    queryKey: ['creator-pet', (address || '').toLowerCase()],
    queryFn: () => getCreatorPet(address || ''),
    enabled: !!address,
    staleTime: 60_000,
    retry: false,
  });
  if (!data) return null;
  return <PetCard pet={data} own={own} className={className} />;
}
