// MCP settings tab listing the resources the server exposes.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { McpStatusResourceDescriptor } from './types';
import { CardDescription, CardTitle, commonSectionStyle } from './shared';

interface Props {
  resourceDetails: McpStatusResourceDescriptor[];
}

const getResourceKey = (uri: string) => uri.split('//')[1].replace('/', '_').replace('-', '_');

/**
 * Card for one MCP resource: translated title and description (falling back to the server's text),
 * its URI and an autopilot badge when preferred for agents.
 */
const ResourceCard: React.FC<{ resource: McpStatusResourceDescriptor }> = ({ resource }) => {
  const { t } = useTranslation();
  const key = getResourceKey(resource.uri);
  return (
    <div style={commonSectionStyle}>
      <CardTitle
        title={t(`mcpSettings.resources.${key}.title`, { defaultValue: resource.title })}
        badge={resource.preferredForAgents && t('mcpSettings.forAutopilot')}
        id={resource.uri}
      />
      <CardDescription>
        {t(`mcpSettings.resources.${key}.description`, { defaultValue: resource.description })}
      </CardDescription>
    </div>
  );
};

/** Resources tab: one card per resource reported by the server. */
export const McpSettingsResources: React.FC<Props> = ({ resourceDetails }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    {resourceDetails.map((resource) => (
      <ResourceCard key={resource.uri} resource={resource} />
    ))}
  </div>
);
