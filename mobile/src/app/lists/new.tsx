import { useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { freeLimitFrom, paywallRouteFor } from '@/client/free-limit';
import { toast } from '@/client/toast';
import ListForm from '@/components/list-form';

/** Create a new list. */
export default function NewListScreen() {
  const router = useRouter();
  return (
    <ListForm
      initial={{ name: '', description: '', icon: '', isPublic: false }}
      submitLabel="Create list"
      showVisibility
      onSubmit={async (v) => {
        try {
          await trpc.lists.create.mutate({
            name: v.name,
            description: v.description,
            icon: v.icon,
            isPublic: v.isPublic,
          });
        } catch (e) {
          // A free-tier cap refusal is an upgrade prompt, not an error message. Detected off
          // the structured `error.data.freeLimit` the server's tRPC errorFormatter attaches —
          // never by matching the message text, which is copy and will be reworded.
          //
          // Pushed on top of this create sheet rather than replacing it, so dismissing the
          // paywall returns the user to the list they were part-way through naming.
          const cap = freeLimitFrom(e);
          if (cap) router.push(paywallRouteFor(cap));
          // Re-thrown either way. ListForm only clears its submitting state on failure (a
          // success navigates away), so swallowing this would leave the Save button disabled
          // forever behind the paywall. Re-throwing also leaves the server's reason on screen
          // for whoever dismisses the paywall without buying.
          throw e;
        }
        toast.success('List created');
        router.back();
      }}
    />
  );
}
