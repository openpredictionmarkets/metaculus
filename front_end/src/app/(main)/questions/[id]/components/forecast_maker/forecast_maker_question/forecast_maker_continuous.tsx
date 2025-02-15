"use client";
import { sendGAEvent } from "@next/third-parties/google";
import { useTranslations } from "next-intl";
import React, { FC, useMemo, useState } from "react";

import { createForecasts } from "@/app/(main)/questions/actions";
import { MultiSliderValue } from "@/components/sliders/multi_slider";
import Button from "@/components/ui/button";
import LoadingIndicator from "@/components/ui/loading_indicator";
import { useAuth } from "@/contexts/auth_context";
import { useModal } from "@/contexts/modal_context";
import { useServerAction } from "@/hooks/use_server_action";
import { PostWithForecasts, ProjectPermissions } from "@/types/post";
import {
  PredictionInputMessage,
  QuestionWithNumericForecasts,
} from "@/types/question";
import {
  extractPrevNumericForecastValue,
  getNumericForecastDataset,
} from "@/utils/forecasts";
import { computeQuartilesFromCDF } from "@/utils/math";

import { sendGAPredictEvent } from "./ga_events";
import { useHideCP } from "../../cp_provider";
import ContinuousSlider from "../continuous_slider";
import NumericForecastTable from "../numeric_table";
import QuestionResolutionButton from "../resolution";
import QuestionUnresolveButton from "../resolution/unresolve_button";

type Props = {
  post: PostWithForecasts;
  question: QuestionWithNumericForecasts;
  prevForecast?: any;
  permission?: ProjectPermissions;
  canPredict: boolean;
  canResolve: boolean;
  predictionMessage?: PredictionInputMessage;
};

const ForecastMakerContinuous: FC<Props> = ({
  post,
  question,
  permission,
  prevForecast,
  canPredict,
  canResolve,
  predictionMessage,
}) => {
  const { user } = useAuth();
  const { setCurrentModal } = useModal();
  const { hideCP } = useHideCP();
  const [isDirty, setIsDirty] = useState(false);
  const withCommunityQuartiles = !user || !hideCP;
  const prevForecastValue = extractPrevNumericForecastValue(prevForecast);
  const t = useTranslations();
  const [forecast, setForecast] = useState<MultiSliderValue[]>(
    prevForecastValue?.forecast ?? [
      {
        left: 0.4,
        center: 0.5,
        right: 0.6,
      },
    ]
  );
  const [weights, setWeights] = useState<number[]>(
    prevForecastValue?.weights ?? [1]
  );

  const dataset = useMemo(
    () =>
      getNumericForecastDataset(
        forecast,
        weights,
        question.open_lower_bound!,
        question.open_upper_bound!
      ),
    [forecast, question.open_lower_bound, question.open_upper_bound, weights]
  );

  const userCdf: number[] = dataset.cdf;
  const communityCdf: number[] | undefined =
    question.aggregations.recency_weighted.latest?.forecast_values;

  const handleAddComponent = () => {
    setForecast([
      ...forecast,
      {
        left: 0.4,
        right: 0.6,
        center: 0.5,
      },
    ]);
    setWeights([...weights, 1]);
  };

  const handlePredictSubmit = async () => {
    sendGAPredictEvent(post, question, hideCP);

    const response = await createForecasts(post.id, [
      {
        questionId: question.id,
        forecastData: {
          continuousCdf: userCdf,
          probabilityYes: null,
          probabilityYesPerCategory: null,
        },
        sliderValues: {
          forecast: forecast,
          weights: weights,
        },
      },
    ]);
    if (response && "errors" in response && !!response.errors) {
      throw response.errors;
    }

    setIsDirty(false);
  };
  const [submit, isPending] = useServerAction(handlePredictSubmit);
  const submitIsAllowed = !isPending && isDirty;
  return (
    <>
      <ContinuousSlider
        forecast={forecast}
        weights={weights}
        dataset={dataset}
        onChange={(forecast, weight) => {
          setForecast(forecast);
          setWeights(weight);
          setIsDirty(true);
        }}
        question={question}
        disabled={!canPredict}
      />

      {canPredict && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 px-4">
            {user ? (
              <>
                <Button
                  variant="secondary"
                  type="reset"
                  onClick={handleAddComponent}
                >
                  {t("addComponentButton")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  onClick={submit}
                  disabled={!submitIsAllowed}
                >
                  {t("saveChange")}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                type="button"
                onClick={() => setCurrentModal({ type: "signup" })}
              >
                {t("signUpToPredict")}
              </Button>
            )}
          </div>
          <div className="h-[32px]">{isPending && <LoadingIndicator />}</div>
        </>
      )}
      {predictionMessage && (
        <div className="mb-2 text-center text-sm italic text-gray-700 dark:text-gray-700-dark">
          {t(predictionMessage)}
        </div>
      )}
      <NumericForecastTable
        question={question}
        userBounds={{
          belowLower: userCdf[0],
          aboveUpper: 1 - userCdf[userCdf.length - 1],
        }}
        userQuartiles={userCdf ? computeQuartilesFromCDF(userCdf) : undefined}
        communityBounds={
          communityCdf
            ? {
                belowLower: communityCdf[0],
                aboveUpper: 1 - communityCdf[communityCdf.length - 1],
              }
            : undefined
        }
        communityQuartiles={
          communityCdf ? computeQuartilesFromCDF(communityCdf) : undefined
        }
        withCommunityQuartiles={withCommunityQuartiles}
        isDirty={isDirty}
        hasUserForecast={!!prevForecastValue.forecast}
      />

      <div className="flex flex-col items-center justify-center">
        <QuestionUnresolveButton question={question} permission={permission} />
        {canResolve && (
          <QuestionResolutionButton
            question={question}
            permission={permission}
          />
        )}
      </div>
    </>
  );
};

export default ForecastMakerContinuous;
