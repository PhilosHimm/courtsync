import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MatchList, Timeline } from '@/components/app/ScheduleViews';
import { StandingsView } from '@/components/app/StandingsView';
import { courts, rows, standings, timeslots, zone } from './fixtures';

const meta: Meta = { title: 'Components/Schedule' };
export default meta;

/** The accessible baseline — a real table that works at every width. */
export const List: StoryObj = {
  render: () => <MatchList rows={rows} zone={zone} hrefFor={() => '#'} />,
};

/** The court × time grid: the only element with the system shadow. */
export const CourtTimeline: StoryObj = {
  render: () => (
    <Timeline
      rows={rows}
      timeslots={timeslots}
      courts={courts}
      zone={zone}
      hrefFor={() => '#'}
      selected="m3"
    />
  ),
};

/** Every row says why it is where it is. */
export const Standings: StoryObj = {
  render: () => (
    <StandingsView
      title="Pool A"
      standings={standings}
      matches={[]}
      splitSetsDecidedByTotalPoints
    />
  ),
};
