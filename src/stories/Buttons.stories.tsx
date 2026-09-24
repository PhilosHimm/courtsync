import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ButtonLink, TextLink } from '@/components/Button';

const meta: Meta = { title: 'Components/Buttons' };
export default meta;

/** Two grammars, never mixed: the blue pill is action, the dark rectangle is chrome. */
export const Variants: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <ButtonLink href="#">Primary action</ButtonLink>
      <ButtonLink href="#" variant="secondary">
        Secondary
      </ButtonLink>
      <ButtonLink href="#" variant="utility">
        Utility
      </ButtonLink>
      <ButtonLink href="#" variant="hero">
        Hero
      </ButtonLink>
    </div>
  ),
};

export const InlineLink: StoryObj = {
  render: () => (
    <p className="text-body">
      A link inside running text is underlined, so it is not colour alone:{' '}
      <TextLink href="#">open the demo</TextLink>.
    </p>
  ),
};
