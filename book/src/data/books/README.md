# Custom partner books

This folder holds per-partner overrides of `../defaultBook.ts`.

## Convention

Each custom book lives in `<slug>Book.ts`, e.g. `dgosBook.ts`. It imports
`defaultBook` and returns a modified copy — usually by mapping over `slides`
and swapping the ones that differ.

```ts
import type { Book, Slide } from '../../lib/types'
import { defaultBook } from '../defaultBook'

export const dgosBook: Book = {
  ...defaultBook,
  slides: defaultBook.slides.map<Slide>((slide, i) => {
    // Example: replace the Benefits slide with a DGOS-specific version
    if (slide.type === 'benefits') {
      return { type: 'benefits', props: { /* DGOS overrides */ } }
    }
    return slide
  }),
}
```

## Deploying a custom book

For every custom book we generate a matching SQL migration
`supabase/migrations/9xx_<slug>_book.sql` that does a targeted
`update public.partner_books set slides = '<json>'::jsonb where partner_id = …`.

Running that migration in the Supabase SQL editor updates ONLY that partner's
row. The other partners keep whatever content they had (default or their own
custom book).

## Reverting a partner to the default

If you decide a partner should go back to the standard content:

```sql
select public.apply_default_book('<slug>');
```

That overwrites their `slides` column with the current default JSON.
