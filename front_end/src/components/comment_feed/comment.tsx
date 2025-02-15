"use client";

import {
  faXmark,
  faChevronDown,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { sendGAEvent } from "@next/third-parties/google";
import classNames from "classnames";
import { useLocale, useTranslations } from "next-intl";
import { FC, useState, useEffect, useRef } from "react";

import {
  softDeleteComment,
  editComment,
  createForecasts,
} from "@/app/(main)/questions/actions";
import CommentEditor from "@/components/comment_feed/comment_editor";
import CommentReportModal from "@/components/comment_feed/comment_report_modal";
import CommentVoter from "@/components/comment_feed/comment_voter";
import MarkdownEditor from "@/components/markdown_editor";
import Button from "@/components/ui/button";
import DropdownMenu, { MenuItemProps } from "@/components/ui/dropdown_menu";
import { useAuth } from "@/contexts/auth_context";
import { CommentPermissions, CommentType } from "@/types/comment";
import { PostWithForecasts } from "@/types/post";
import { QuestionType } from "@/types/question";
import { parseUserMentions } from "@/utils/comments";
import { formatDate } from "@/utils/date_formatters";
import { logError } from "@/utils/errors";
import { canPredictQuestion } from "@/utils/questions";

import { CmmOverlay, CmmToggleButton, useCmmContext } from "./comment_cmm";
import IncludedForecast from "./included_forecast";

import { SortOption, sortComments } from ".";

type CommentChildrenTreeProps = {
  commentChildren: CommentType[];
  permissions: CommentPermissions;
  expandedChildren?: boolean;
  treeDepth: number;
  sort: SortOption;
};

const CommentChildrenTree: FC<CommentChildrenTreeProps> = ({
  commentChildren,
  permissions,
  expandedChildren = false,
  treeDepth,
  sort,
}) => {
  const t = useTranslations();
  const sortedCommentChildren = sortComments([...commentChildren], sort);
  const [childrenExpanded, setChildrenExpanded] = useState(
    expandedChildren && treeDepth < 5
  );

  function getTreeSize(commentChildren: CommentType[]): number {
    let totalChildren = 0;
    commentChildren.forEach((comment) => {
      if (comment.children.length === 0) {
        // count just this parent comment with no children
        totalChildren += 1;
      } else {
        // count this comment plus its children
        totalChildren += getTreeSize(comment.children) + 1;
      }
    });
    return totalChildren;
  }

  return (
    <>
      <button
        className={classNames(
          "mb-1 mt-2.5 flex w-full items-center justify-center gap-2 rounded-sm rounded-sm px-2 py-1 text-sm text-blue-700 no-underline hover:bg-blue-400 disabled:bg-gray-0 dark:text-blue-700-dark dark:hover:bg-blue-700/65 disabled:dark:border-blue-500-dark disabled:dark:bg-gray-0-dark",
          {
            "border border-transparent bg-blue-400/50 dark:bg-blue-700/30":
              !childrenExpanded,
            "border border-blue-400 bg-transparent hover:bg-blue-400/50 dark:border-blue-600/50 dark:hover:bg-blue-700/50":
              childrenExpanded,
          }
        )}
        onClick={() => {
          setChildrenExpanded(!childrenExpanded);
        }}
      >
        <FontAwesomeIcon
          icon={faChevronDown}
          className={classNames("inline-block transition-transform", {
            "-rotate-180": childrenExpanded,
          })}
        />
        <span className="no-underline">
          {childrenExpanded
            ? t("hideReplyWithCount", { count: getTreeSize(commentChildren) })
            : t("showReplyWithCount", { count: getTreeSize(commentChildren) })}
        </span>
      </button>
      <div
        className={classNames(
          "relative",
          treeDepth < 5 ? "pl-3" : null,
          childrenExpanded ? "pt-1.5" : null
        )}
      >
        {treeDepth < 5 && (
          <div
            className="absolute inset-y-0 -left-2 top-2 w-4 cursor-pointer after:absolute after:inset-y-0 after:left-2 after:block after:w-px after:border-l after:border-blue-400 after:content-[''] after:hover:border-blue-600 after:dark:border-blue-600/80 after:hover:dark:border-blue-400/80"
            onClick={() => {
              setChildrenExpanded(!childrenExpanded);
            }}
          />
        )}
        {childrenExpanded &&
          sortedCommentChildren.map((child: CommentType) => (
            <div
              key={child.id}
              className="my-1 rounded-md bg-blue-500/15 px-2.5 py-1.5 dark:bg-blue-500/10"
            >
              <Comment
                comment={child}
                permissions={permissions}
                treeDepth={treeDepth}
                sort={sort}
              />
            </div>
          ))}
      </div>
    </>
  );
};

type CommentProps = {
  comment: CommentType;
  permissions: CommentPermissions;
  onProfile?: boolean;
  treeDepth: number;
  sort: SortOption;
  postData?: PostWithForecasts;
  lastViewedAt?: string;
};

const Comment: FC<CommentProps> = ({
  comment,
  permissions,
  onProfile = false,
  treeDepth,
  sort,
  postData,
  lastViewedAt,
}) => {
  const locale = useLocale();
  const t = useTranslations();
  const commentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleted, setIsDeleted] = useState(comment.is_soft_deleted);
  const [isReplying, setIsReplying] = useState(false);
  const [commentMarkdown, setCommentMarkdown] = useState(
    parseUserMentions(comment.text, comment.mentioned_users)
  );
  const [tempCommentMarkdown, setTempCommentMarkdown] = useState("");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const { user } = useAuth();
  if (user?.id === comment.author.id) {
    permissions = CommentPermissions.CREATOR;
  }

  const userCanPredict = postData && canPredictQuestion(postData);
  const userForecast =
    postData?.question?.my_forecasts?.latest?.forecast_values[1] ?? 0.5;

  const isCmmButtonVisible =
    user?.id !== comment.author.id && !!postData?.question;
  const isCmmButtonDisabled = !user || !userCanPredict;
  // TODO: find a better way to dedect whether on mobile or not. For now we need to know in JS
  // too and can't use tw classes
  const isMobileScreen = window.innerWidth < 640;

  const cmmContext = useCmmContext(
    comment.changed_my_mind.count,
    comment.changed_my_mind.for_this_user
  );

  const updateForecast = async (value: number) => {
    const response = await createForecasts(comment.on_post, [
      {
        questionId: postData?.question?.id ?? 0,
        forecastData: {
          continuousCdf: null,
          probabilityYes: value,
          probabilityYesPerCategory: null,
        },
      },
    ]);
    sendGAEvent("event", "commentChangedPrediction");
    if (response && "errors" in response && !!response.errors) {
      throw response.errors;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      logError(err, `${t("failedToCopyText")} ${err}`);
    }
  };

  useEffect(() => {
    const match = window.location.hash.match(/#comment-(\d+)/);
    if (!match) return;

    const focus_comment_id = Number(match[1]);
    if (focus_comment_id === comment.id) {
      commentRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
      });
    }
  }, [comment.id]);

  const menuItems: MenuItemProps[] = [
    {
      hidden: !isMobileScreen || !isCmmButtonVisible,
      id: "cmm",
      element: (
        <div>
          <CmmToggleButton
            cmmContext={cmmContext}
            comment_id={comment.id}
            disabled={isCmmButtonDisabled}
          />
        </div>
      ),
      onClick: () => {
        return null; // handled by the button element
      },
    },
    {
      hidden:
        permissions !== CommentPermissions.CREATOR &&
        permissions !== CommentPermissions.CURATOR,
      id: "edit",
      name: t("edit"),
      onClick: () => {
        setTempCommentMarkdown(commentMarkdown);
        setIsEditing(true);
      },
    },
    {
      id: "copyLink",
      name: t("copyLink"),
      onClick: () => {
        const urlWithoutHash = window.location.href.split("#")[0];
        copyToClipboard(`${urlWithoutHash}#comment-${comment.id}`);
      },
    },
    {
      hidden: !user?.id,
      id: "report",
      name: t("report"),
      onClick: () => setIsReportModalOpen(true),
    },
    {
      hidden: permissions !== CommentPermissions.CURATOR,
      id: "delete",
      name: t("delete"),
      onClick: async () => {
        //setDeleteModalOpen(true),
        const response = await softDeleteComment(comment.id);

        if (response && "errors" in response) {
          console.error("Error deleting comment:", response.errors);
        } else {
          setIsDeleted(true);
        }
      },
    },
  ];

  if (isDeleted) {
    return (
      <div id={`comment-${comment.id}`} ref={commentRef}>
        {comment.included_forecast && (
          <IncludedForecast
            author={t("deletedAuthor")}
            forecast={comment.included_forecast}
          />
        )}
        <div className="my-2.5 flex flex-col items-start gap-1">
          <span className="inline-flex items-center">
            <span className="italic text-gray-600 dark:text-gray-600-dark">
              {t("deleted")}
            </span>
            <span className="mx-1">·</span>
            {formatDate(locale, new Date(comment.created_at))}
          </span>
        </div>
        <div className="italic text-gray-600 break-anywhere dark:text-gray-600-dark">
          {t("commentDeleted")}
        </div>

        {comment.children.length > 0 && (
          <CommentChildrenTree
            commentChildren={comment.children}
            permissions={permissions}
            treeDepth={treeDepth + 1}
            sort={sort}
          />
        )}
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} ref={commentRef}>
      <div
        className={classNames("", {
          "":
            lastViewedAt &&
            new Date(lastViewedAt) < new Date(comment.created_at),
        })}
      >
        <CmmOverlay
          forecast={100 * userForecast}
          updateForecast={updateForecast}
          showForecastingUI={postData?.question?.type === QuestionType.Binary}
          onClickScrollLink={() => {
            cmmContext.setIsOverlayOpen(false);
            const section = document.getElementById("prediction-section");
            if (section) {
              section.scrollIntoView({ behavior: "smooth" });
            }
          }}
          cmmContext={cmmContext}
        />

        {/* comment indexing is broken, since the comment feed loading happens async for the client*/}
        {comment.included_forecast && (
          <IncludedForecast
            author={comment.author.username}
            forecast={comment.included_forecast}
          />
        )}
        <div className="mb-1 flex flex-col items-start gap-1">
          <span className="inline-flex items-center text-base">
            <a
              className="no-underline"
              href={`/accounts/profile/${comment.author.id}/`}
            >
              <h4 className="my-1 text-base">
                {comment.author.username}
                {comment.author.is_bot && " 🤖"}
              </h4>
            </a>
            {/*
          {comment.is_moderator && !comment.is_admin && (
            <Moderator className="ml-2 text-lg" />
          )}
          {comment.is_admin && <Admin className="ml-2 text-lg" />}
          */}
            <span className="mx-1 opacity-55">·</span>
            <span className="opacity-55">
              {formatDate(locale, new Date(comment.created_at))}
            </span>
          </span>
          {/*
        <span className="text-gray-600 dark:text-gray-600-dark block text-xs leading-3">
          {comment.parent
            ? t("replied")
            : t(commentTypes[comment.submit_type]?.verb ?? "commented")}{" "}
          {commentAge(comment.created_time)}
        </span>
        */}
        </div>

        {/* TODO: fix TS error */}
        {/* {comment.parent && onProfile && (
        <div>
          <a
            href={`/questions/${comment.parent.on_post}/#comment-${comment.parent.id}`}
          >
            {t('inReplyTo', {author: comment.parent.author.username})}
          </a>
        </div>
      )} */}

        <div className="break-anywhere">
          {isEditing && (
            <MarkdownEditor
              markdown={commentMarkdown}
              mode={"write"}
              onChange={setCommentMarkdown}
            />
          )}{" "}
          {!isEditing && (
            <MarkdownEditor markdown={commentMarkdown} mode={"read"} />
          )}
        </div>
        {isEditing && (
          <>
            <Button
              onClick={async () => {
                const response = await editComment({
                  id: comment.id,
                  text: commentMarkdown,
                  author: user!.id,
                });
                if (response && "errors" in response) {
                  console.error(t("errorDeletingComment"), response.errors);
                } else {
                  setIsEditing(false);
                }
              }}
            >
              {t("save")}
            </Button>
            <Button
              className="ml-2"
              onClick={() => {
                setCommentMarkdown(tempCommentMarkdown);
                setIsEditing(false);
              }}
            >
              {t("cancel")}
            </Button>
          </>
        )}
        <div className="mb-2 mt-1 h-7 overflow-visible">
          <div className="flex items-center justify-between text-sm leading-4 text-gray-900 dark:text-gray-900-dark">
            <div className="inline-flex items-center gap-2.5">
              <CommentVoter
                voteData={{
                  commentAuthorId: comment.author.id,
                  commentId: comment.id,
                  voteScore: comment.vote_score,
                  userVote: comment.user_vote ?? null,
                }}
              />

              {isCmmButtonVisible && !isMobileScreen && (
                <CmmToggleButton
                  cmmContext={cmmContext}
                  comment_id={comment.id}
                  disabled={isCmmButtonDisabled}
                  ref={cmmContext.setAnchorRef}
                />
              )}

              {!onProfile &&
                (isReplying ? (
                  <Button
                    size="xxs"
                    variant="tertiary"
                    onClick={() => {
                      setIsReplying(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faXmark} className="size-4 p-1" />
                    {t("cancel")}
                  </Button>
                ) : (
                  <Button
                    size="xxs"
                    onClick={() => setIsReplying(true)}
                    variant="tertiary"
                    className="gap-0.5"
                  >
                    <FontAwesomeIcon
                      icon={faReply}
                      className="size-4 p-1"
                      size="xs"
                    />
                    {t("reply")}
                  </Button>
                ))}
            </div>

            <div ref={isMobileScreen ? cmmContext.setAnchorRef : null}>
              <DropdownMenu items={menuItems} />
            </div>
          </div>
        </div>
      </div>
      {isReplying && (
        <CommentEditor
          parentId={comment.id}
          postId={comment.on_post}
          text={formatMention(comment)}
          onSubmit={(newComment: CommentType) => {
            addNewChildrenComment(comment, newComment);
            setIsReplying(false);
          }}
          isReplying={isReplying}
        />
      )}

      {comment.children.length > 0 && (
        <CommentChildrenTree
          commentChildren={comment.children}
          permissions={permissions}
          expandedChildren={!onProfile}
          treeDepth={treeDepth + 1}
          sort={sort}
        />
      )}
      <CommentReportModal
        comment={comment}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
};

function addNewChildrenComment(comment: CommentType, newComment: CommentType) {
  if (comment.id === newComment.parent_id) {
    comment.children.push(newComment);
    return;
  }
  comment.children.map((nestedComment) => {
    addNewChildrenComment(nestedComment, newComment);
  });
}

function formatMention(comment: CommentType) {
  return `[@${comment.author.username}](/accounts/profile/${comment.author.id})`;
}

export default Comment;
