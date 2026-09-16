import React from 'react';
import { useTranslation } from 'react-i18next';
import { McpStatusResourceDescriptor } from './types';
import { commonSectionStyle } from './shared';

interface Props {
  resourceDetails: McpStatusResourceDescriptor[];
}

export const McpSettingsResources: React.FC<Props> = ({ resourceDetails }) => {
  const { t } = useTranslation();

  const getResourceKey = (uri: string) => uri.split('//')[1].replace('/', '_').replace('-', '_');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {resourceDetails.map((resource) => (
        <div key={resource.uri} style={commonSectionStyle}>
          <div
            style={{
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span>
              {t(`mcpSettings.resources.${getResourceKey(resource.uri)}.title`, {
                defaultValue: resource.title,
              })}
            </span>
            {resource.preferredForAgents && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'var(--accbg)',
                  border: '1px solid var(--acc)',
                  color: 'var(--acc)',
                }}
              >
                {t('mcpSettings.forAutopilot')}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>
            {resource.uri}
          </div>
          <div
            style={{
              marginTop: '8px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            {t(`mcpSettings.resources.${getResourceKey(resource.uri)}.description`, {
              defaultValue: resource.description,
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
