import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Post, PostType } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { Employee } from '../employee/entities/employee.entity';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { MessageService } from '../message/message.service';
import { MessageGateway } from '../message/message.gateway';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly likeRepo: Repository<PostLike>,
    @InjectRepository(PostComment)
    private readonly commentRepo: Repository<PostComment>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPushToken)
    private readonly pushTokenRepo: Repository<UserPushToken>,
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Create a new post
   */
  async createPost(data: {
    content: string;
    imageUrl?: string;
    postType?: PostType;
    authorId: string;
    organizationId: string;
    isPinned?: boolean;
  }): Promise<Post> {
    const post = this.postRepo.create({
      content: data.content,
      imageUrl: data.imageUrl,
      postType: data.postType || PostType.GENERAL,
      authorId: data.authorId,
      organizationId: data.organizationId,
      isPinned: data.isPinned || false,
    });
    const saved = await this.postRepo.save(post);

    // Fire-and-forget notification dispatch — don't block the response.
    this.dispatchPostNotification(
      saved,
      data.authorId,
      data.organizationId,
    ).catch((err) =>
      this.logger.warn(`Post notification failed: ${(err as Error).message}`),
    );

    return saved;
  }

  /**
   * Notify every employee in the organization about a new post.
   * 1. Create in-app message (DB)
   * 2. Emit Socket.IO `message:new` event
   * 3. Send FCM push notification
   */
  private async dispatchPostNotification(
    post: Post,
    authorId: string,
    organizationId: string,
  ): Promise<void> {
    const postTypeLabel =
      post.postType === PostType.ANNOUNCEMENT
        ? 'Announcement'
        : post.postType === PostType.NEW_JOINER
          ? 'New Joiner'
          : post.postType === PostType.CELEBRATION
            ? 'Celebration'
            : post.postType === PostType.EVENT
              ? 'Event'
              : 'Post';

    const title = `New ${postTypeLabel}`;
    const body =
      post.content.length > 120
        ? `${post.content.substring(0, 120)}…`
        : post.content;

    // Get all users in the org except the author
    const users = await this.userRepo.find({
      where: { organizationId },
      select: ['id'],
    });
    const recipientUserIds = users
      .map((u) => u.id)
      .filter((id) => id !== authorId);

    if (recipientUserIds.length === 0) return;

    // 1. In-app message (DB write)
    const result = await this.messageService.createMessage(authorId, {
      organizationId,
      recipientUserIds,
      title,
      body,
      type: 'post',
    });

    // 2. WebSocket real-time push
    this.messageGateway.emitToUsers(recipientUserIds, {
      message: result.message,
    });

    // 3. Firebase push notification (mobile + background)
    try {
      const pushTokens = await this.pushTokenRepo.find({
        where: { userId: In(recipientUserIds) },
        select: ['token'],
      });
      const tokens = pushTokens.map((t) => t.token);
      if (tokens.length > 0) {
        const { invalidTokens } = await this.firebaseService.sendToTokens(
          tokens,
          {
            title,
            body,
            data: { type: 'post_notification', postId: post.id },
          },
        );
        if (invalidTokens.length) {
          await this.pushTokenRepo.delete({ token: In(invalidTokens) });
        }
      }
    } catch (err) {
      this.logger.warn(
        `Push notification failed for post ${post.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Get all posts for an organization (with likes and comments count)
   */
  async getAllPosts(organizationId: string): Promise<Post[]> {
    return this.postRepo.find({
      where: { organizationId },
      relations: ['author'],
      order: { isPinned: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Get posts with like and comment counts
   */
  async getPostsWithCounts(organizationId: string): Promise<any[]> {
    const posts = await this.postRepo.find({
      where: { organizationId },
      relations: ['author'],
      order: { isPinned: 'DESC', createdAt: 'DESC' },
    });

    // Get likes and comments with user data for each post
    const postsWithCounts = await Promise.all(
      posts.map(async (post: Post) => {
        const likes = await this.likeRepo.find({
          where: { postId: post.id },
          relations: ['user'],
        });

        // Add passport photo to each like
        const likesWithPhotos = await Promise.all(
          likes.map(async (like) => {
            const passportPhotoUrl = await this.getEmployeePassportPhoto(
              like.userId,
            );
            return {
              ...like,
              user: {
                ...like.user,
                passportPhotoUrl,
              },
            };
          }),
        );

        const comments = await this.commentRepo.find({
          where: { postId: post.id },
          relations: ['user'],
          order: { createdAt: 'DESC' },
        });

        // Add passport photo to each comment
        const commentsWithPhotos = await Promise.all(
          comments.map(async (comment) => {
            const passportPhotoUrl = await this.getEmployeePassportPhoto(
              comment.userId,
            );
            return {
              ...comment,
              user: {
                ...comment.user,
                passportPhotoUrl,
              },
            };
          }),
        );

        return {
          ...post,
          likes: likesWithPhotos,
          comments: commentsWithPhotos,
          likeCount: likes.length,
          commentCount: comments.length,
        };
      }),
    );

    return postsWithCounts;
  }

  /**
   * Get latest posts (for dashboard widget)
   */
  async getLatestPosts(
    organizationId: string,
    limit: number = 5,
  ): Promise<any[]> {
    const posts = await this.postRepo.find({
      where: { organizationId },
      relations: ['author'],
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      take: limit,
    });

    const postsWithCounts = await Promise.all(
      posts.map(async (post: Post) => {
        const likes = await this.likeRepo.find({
          where: { postId: post.id },
          relations: ['user'],
        });

        // Add passport photo to each like
        const likesWithPhotos = await Promise.all(
          likes.map(async (like) => {
            const passportPhotoUrl = await this.getEmployeePassportPhoto(
              like.userId,
            );
            return {
              ...like,
              user: {
                ...like.user,
                passportPhotoUrl,
              },
            };
          }),
        );

        const comments = await this.commentRepo.find({
          where: { postId: post.id },
          relations: ['user'],
          order: { createdAt: 'DESC' },
        });

        // Add passport photo to each comment
        const commentsWithPhotos = await Promise.all(
          comments.map(async (comment) => {
            const passportPhotoUrl = await this.getEmployeePassportPhoto(
              comment.userId,
            );
            return {
              ...comment,
              user: {
                ...comment.user,
                passportPhotoUrl,
              },
            };
          }),
        );

        return {
          ...post,
          likes: likesWithPhotos,
          comments: commentsWithPhotos,
          likeCount: likes.length,
          commentCount: comments.length,
        };
      }),
    );

    return postsWithCounts;
  }

  /**
   * Get a single post by ID
   */
  async getPostById(id: string): Promise<Post> {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  /**
   * Get post with likes and comments
   */
  async getPostWithInteractions(id: string): Promise<any> {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const likes = await this.likeRepo.find({
      where: { postId: id },
      relations: ['user'],
    });

    // Add passport photo to each like
    const likesWithPhotos = await Promise.all(
      likes.map(async (like) => {
        const passportPhotoUrl = await this.getEmployeePassportPhoto(
          like.userId,
        );
        return {
          ...like,
          user: {
            ...like.user,
            passportPhotoUrl,
          },
        };
      }),
    );

    const comments = await this.commentRepo.find({
      where: { postId: id },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    // Add passport photo to each comment
    const commentsWithPhotos = await Promise.all(
      comments.map(async (comment) => {
        const passportPhotoUrl = await this.getEmployeePassportPhoto(
          comment.userId,
        );
        return {
          ...comment,
          user: {
            ...comment.user,
            passportPhotoUrl,
          },
        };
      }),
    );

    return {
      ...post,
      likes: likesWithPhotos,
      comments: commentsWithPhotos,
      likeCount: likes.length,
      commentCount: comments.length,
    };
  }

  /**
   * Update a post
   */
  async updatePost(
    id: string,
    data: Partial<{
      content: string;
      imageUrl: string;
      postType: PostType;
      isPinned: boolean;
    }>,
  ): Promise<Post> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    Object.assign(post, data);
    return this.postRepo.save(post);
  }

  /**
   * Delete a post
   */
  async deletePost(id: string): Promise<{ message: string }> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    // Delete related likes and comments first
    await this.likeRepo.delete({ postId: id });
    await this.commentRepo.delete({ postId: id });
    await this.postRepo.delete(id);
    return { message: 'Post deleted successfully' };
  }

  /**
   * Like a post
   */
  async likePost(postId: string, userId: string): Promise<PostLike> {
    // Check if already liked
    const existingLike = await this.likeRepo.findOne({
      where: { postId, userId },
    });
    if (existingLike) {
      throw new BadRequestException('You have already liked this post');
    }

    const like = this.likeRepo.create({ postId, userId });
    return this.likeRepo.save(like);
  }

  /**
   * Unlike a post
   */
  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const result = await this.likeRepo.delete({ postId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Like not found');
    }
    return { message: 'Like removed successfully' };
  }

  /**
   * Get likes for a post
   */
  async getPostLikes(postId: string): Promise<PostLike[]> {
    return this.likeRepo.find({
      where: { postId },
      relations: ['user'],
    });
  }

  /**
   * Check if user has liked a post
   */
  async hasUserLiked(postId: string, userId: string): Promise<boolean> {
    const like = await this.likeRepo.findOne({
      where: { postId, userId },
    });
    return !!like;
  }

  /**
   * Add a comment to a post
   */
  async commentPost(data: {
    postId: string;
    userId: string;
    content: string;
  }): Promise<PostComment> {
    const comment = this.commentRepo.create(data);
    return this.commentRepo.save(comment);
  }

  /**
   * Get comments for a post
   */
  async getPostComments(postId: string): Promise<PostComment[]> {
    return this.commentRepo.find({
      where: { postId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<{ message: string }> {
    const result = await this.commentRepo.delete(commentId);
    if (result.affected === 0) {
      throw new NotFoundException('Comment not found');
    }
    return { message: 'Comment deleted successfully' };
  }

  /**
   * Get post count for organization
   */
  async getPostCount(organizationId: string): Promise<number> {
    return this.postRepo.count({ where: { organizationId } });
  }

  /**
   * Get employee passport photo by userId
   */
  private async getEmployeePassportPhoto(
    userId: string,
  ): Promise<string | null> {
    const employee = await this.employeeRepo.findOne({
      where: { userId },
    });
    return employee?.passportPhotoUrl || null;
  }
}
