import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..', '..');
const readmes = fs.readdirSync(root).filter((name) => /^README(\.[\w-]+)?\.md$/.test(name));

// The user's GitHub profile hotlinks images of this repository; renaming or deleting one breaks
// it silently, so everything the READMEs show has to exist, and so does every image the profile
// is known to use.
const PUBLISHED_IMAGES = ['screenshots/graph-hierarchy.png'];

describe('README assets', () => {
  it('finds the README files', () => {
    expect(readmes).toContain('README.md');
  });

  it.each(readmes)('%s only references images and documents that exist', (readme) => {
    const text = fs.readFileSync(path.join(root, readme), 'utf-8');
    const references = [...text.matchAll(/\]\(((?:screenshots|assets|docs)\/[^)#\s]+)/g)].map(
      (match) => match[1]
    );
    for (const reference of references) {
      expect(fs.existsSync(path.join(root, reference)), `${readme} -> ${reference}`).toBe(true);
    }
  });

  it('keeps the images that other pages link to', () => {
    for (const image of PUBLISHED_IMAGES) {
      expect(fs.existsSync(path.join(root, image)), image).toBe(true);
    }
  });
});
