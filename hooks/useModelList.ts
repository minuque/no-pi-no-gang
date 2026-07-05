"use client";

import { useCallback, useEffect, useState } from "react";

import type { ModelListItem } from "./useAgentState";

export type NewSessionModel = { provider: string; modelId: string } | null;

type ModelsResponse = {
  models: Record<string, string>;
  modelList?: ModelListItem[];
  defaultModel?: NewSessionModel;
  thinkingLevels?: Record<string, string[]>;
  thinkingLevelMaps?: Record<string, Record<string, string | null>>;
};

export function selectDefaultModel(
  modelList: ModelListItem[],
  defaultModel?: NewSessionModel,
): NewSessionModel {
  if (modelList.length === 0) return null;
  const match =
    defaultModel &&
    modelList.find(
      (model) => model.id === defaultModel.modelId && model.provider === defaultModel.provider,
    );
  return match
    ? { provider: match.provider, modelId: match.id }
    : { provider: modelList[0].provider, modelId: modelList[0].id };
}

export function useModelList({
  isNew = false,
  onDefaultModel,
  refreshKey,
}: {
  isNew?: boolean;
  onDefaultModel?: (model: NewSessionModel) => void;
  refreshKey?: number;
} = {}) {
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<ModelListItem[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [newSessionModel, setNewSessionModelState] = useState<NewSessionModel>(null);

  const setNewSessionModel = useCallback(
    (model: NewSessionModel) => {
      setNewSessionModelState(model);
      onDefaultModel?.(model);
    },
    [onDefaultModel],
  );

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: ModelsResponse) => {
        setModelNames(data.models);
        if (data.thinkingLevels) setModelThinkingLevels(data.thinkingLevels);
        if (data.thinkingLevelMaps) setModelThinkingLevelMaps(data.thinkingLevelMaps);
        if (data.modelList) {
          setModelList(data.modelList);
          if (isNew) setNewSessionModel(selectDefaultModel(data.modelList, data.defaultModel));
        }
      })
      .catch(() => {});
  }, [isNew, refreshKey, setNewSessionModel]);

  return {
    modelNames,
    modelList,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    newSessionModel,
    setNewSessionModel,
  };
}
