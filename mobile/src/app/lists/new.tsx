import { useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import ListForm from '@/components/list-form';

/** Create a new list. */
export default function NewListScreen() {
  const router = useRouter();
  return (
    <ListForm
      initial={{ name: '', description: '', icon: '' }}
      submitLabel="Create list"
      onSubmit={async (v) => {
        await trpc.lists.create.mutate({
          name: v.name,
          description: v.description,
          icon: v.icon,
        });
        router.back();
      }}
    />
  );
}
