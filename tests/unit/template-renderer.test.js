const { renderTemplateContent } = require('../../src/core/templates/template-renderer');

describe('template renderer', () => {
  it('renders if / else / else if branches', () => {
    const template = [
      '{{#if isFreeEvent}}FREE{{else if isPaidEvent}}PAID{{else}}UNKNOWN{{/if}}',
      '{{#if senderName}} by {{senderName}}{{else}} by platform{{/if}}'
    ].join('');

    expect(
      renderTemplateContent(template, {
        isFreeEvent: false,
        isPaidEvent: true,
        senderName: ''
      }),
    ).toBe('PAID by platform');
  });

  it('renders each blocks with this, index and parent lookups', () => {
    const template = '{{#each tickets}}[#{{@index}} {{ticketType}} {{participantName}} {{../currency}}]{{/each}}';

    expect(
      renderTemplateContent(template, {
        currency: 'XAF',
        tickets: [
          { ticketType: 'VIP', participantName: 'Aicha' },
          { ticketType: 'Standard', participantName: 'Moussa' }
        ]
      }),
    ).toBe('[#0 VIP Aicha XAF][#1 Standard Moussa XAF]');
  });
});
