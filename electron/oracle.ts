import { EventEmitter } from 'events';
import * as path from 'path';
import Piscina from 'piscina';
import { oracleStore } from './store';
import { getLanguageByExtension } from './parsing/languageRegistry';
import { ProjectLanguageProfile } from './parsing/types';
import { CacheManager } from './oracle/CacheManager';
import { ChurnAnalyzer } from './oracle/ChurnAnalyzer';
import { FileWatcher } from './oracle/FileWatcher';
import { GraphBuilder } from './oracle/GraphBuilder';
import { GraphRepository } from './oracle/GraphRepository';
import { ProjectIndexer } from './oracle/ProjectIndexer';
import { normalizePath } from './oracle/shared';

export class OracleService extends EventEmitter {
  private pool: Piscina;
  private graphRepository: GraphRepository;
  private cacheManager: CacheManager;
  private churnAnalyzer: ChurnAnalyzer;
  private graphBuilder: GraphBuilder;
  private projectIndexer: ProjectIndexer;
  private fileWatcher: FileWatcher;
  private projectLanguageProfile: ProjectLanguageProfile = {
    activeLanguageIds: [],
    languageFileCounts: {},
  };

  constructor() {
    super();
    this.pool = new Piscina({
      filename: path.join(__dirname, 'worker.js'),
    });
    this.graphRepository = new GraphRepository();
    this.cacheManager = new CacheManager();
    this.churnAnalyzer = new ChurnAnalyzer();
    this.graphBuilder = new GraphBuilder();
    this.projectIndexer = new ProjectIndexer(this.pool, this.graphBuilder);
    this.fileWatcher = new FileWatcher(
      this.projectIndexer,
      this.graphBuilder,
      this.graphRepository,
      this.cacheManager
    );
  }

  public getGraph() {
    return this.graphRepository.getGraph();
  }

  private updateLanguageCount(filePath: string, delta: 1 | -1) {
    const language = getLanguageByExtension(path.extname(filePath).toLowerCase());
    if (!language) return;

    const nextCounts = { ...this.projectLanguageProfile.languageFileCounts };
    const nextCount = (nextCounts[language.id] || 0) + delta;

    if (nextCount <= 0) {
      delete nextCounts[language.id];
    } else {
      nextCounts[language.id] = nextCount;
    }

    this.projectLanguageProfile = {
      languageFileCounts: nextCounts,
      activeLanguageIds: Object.entries(nextCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([languageId]) => languageId),
    };
  }

  private emitGraphUpdated() {
    this.emit('graph-updated', this.graphRepository.getGraph());
  }

  public async analyzeProject(baseDir: string) {
    const store = oracleStore.getState();
    const normalizedBaseDir = normalizePath(baseDir);
    this.graphRepository.clear();
    store.setBaseDir(normalizedBaseDir);

    await this.fileWatcher.close();

    const churnMap = await this.churnAnalyzer.analyze(normalizedBaseDir);
    store.setChurnMap(churnMap);

    const cache = await this.cacheManager.load(normalizedBaseDir);
    const indexResult = await this.projectIndexer.indexProject(
      normalizedBaseDir,
      cache,
      (progress) => this.emit('parsing-progress', progress)
    );

    this.projectLanguageProfile = indexResult.languageProfile;
    this.cacheManager.saveDebounced(normalizedBaseDir);

    await this.fileWatcher.start(
      normalizedBaseDir,
      () => this.projectLanguageProfile,
      (filePath, delta) => this.updateLanguageCount(filePath, delta),
      {
        emitGraphUpdated: () => this.emitGraphUpdated(),
      }
    );

    this.emitGraphUpdated();
    setTimeout(() => this.emit('parsing-progress', null), 2000);
    return this.graphRepository.getGraph();
  }
}

export const oracle = new OracleService();
