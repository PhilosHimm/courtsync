import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { INPUT } from '@/components/app/forms';
import {
  Card,
  EmptyState,
  Field,
  Notice,
  PageHeading,
  SectionTitle,
  StatusText,
} from '@/components/app/ui';
import { MATCH_STATUSES } from '@/lib/core';

const meta: Meta = { title: 'Components/App chrome' };
export default meta;

export const Statuses: StoryObj = {
  name: 'Match status — symbol and words',
  render: () => (
    <ul className="flex flex-col gap-2">
      {MATCH_STATUSES.map((s) => (
        <li key={s}>
          <StatusText status={s} />
        </li>
      ))}
    </ul>
  ),
};

export const Notices: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Notice>The audit found nothing wrong.</Notice>
      <Notice tone="warning">2 blocking conflicts — a court is double-booked.</Notice>
      <EmptyState title="No events yet">Start one below.</EmptyState>
    </div>
  ),
};

export const Headings: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-6">
      <PageHeading title="Your events" lead="Signed in as Example Organizer." />
      <SectionTitle note="Muted note on the right">Section title</SectionTitle>
      <Card>
        <p className="text-body-strong">A card</p>
        <p className="text-caption">Utility surface at the 18px radius.</p>
      </Card>
    </div>
  ),
};

export const FormField: StoryObj = {
  render: () => (
    <Field id="story-name" label="Event name" hint="Shown on the public page.">
      <input
        id="story-name"
        className={INPUT}
        defaultValue="Example Open"
        aria-describedby="story-name-hint"
      />
    </Field>
  ),
};
