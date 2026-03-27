import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostType } from './entities/post.entity';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';

@RequireProPlan()
@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /**
   * Create a new post
   */
  @Post()
  async createPost(
    @Body()
    data: {
      content: string;
      imageUrl?: string;
      postType?: PostType;
      authorId: string;
      organizationId: string;
      isPinned?: boolean;
    },
  ) {
    return this.postsService.createPost(data);
  }

  /**
   * Get all posts for an organization
   */
  @Get()
  async getPosts(@Query('organizationId') organizationId: string) {
    return this.postsService.getPostsWithCounts(organizationId);
  }

  /**
   * Get latest posts (for dashboard)
   */
  @Get('latest')
  async getLatestPosts(
    @Query('organizationId') organizationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.getLatestPosts(
      organizationId,
      limit ? parseInt(limit) : 5,
    );
  }

  /**
   * Get a single post by ID
   */
  @Get(':id')
  async getPost(@Param('id') id: string) {
    return this.postsService.getPostWithInteractions(id);
  }

  /**
   * Update a post
   */
  @Put(':id')
  async updatePost(
    @Param('id') id: string,
    @Body()
    data: {
      content?: string;
      imageUrl?: string;
      postType?: PostType;
      isPinned?: boolean;
    },
  ) {
    return this.postsService.updatePost(id, data);
  }

  /**
   * Delete a post
   */
  @Delete(':id')
  async deletePost(@Param('id') id: string) {
    return this.postsService.deletePost(id);
  }

  /**
   * Like a post
   */
  @Post(':id/like')
  async likePost(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ) {
    return this.postsService.likePost(id, body.userId);
  }

  /**
   * Unlike a post
   */
  @Delete(':id/like')
  async unlikePost(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    return this.postsService.unlikePost(id, userId);
  }

  /**
   * Get likes for a post
   */
  @Get(':id/likes')
  async getPostLikes(@Param('id') id: string) {
    return this.postsService.getPostLikes(id);
  }

  /**
   * Check if user liked a post
   */
  @Get(':id/liked')
  async hasUserLiked(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    return { liked: await this.postsService.hasUserLiked(id, userId) };
  }

  /**
   * Add a comment to a post
   */
  @Post(':id/comments')
  async commentPost(
    @Param('id') id: string,
    @Body() body: { userId: string; content: string },
  ) {
    return this.postsService.commentPost({
      postId: id,
      userId: body.userId,
      content: body.content,
    });
  }

  /**
   * Get comments for a post
   */
  @Get(':id/comments')
  async getPostComments(@Param('id') id: string) {
    return this.postsService.getPostComments(id);
  }

  /**
   * Delete a comment
   */
  @Delete('comments/:commentId')
  async deleteComment(@Param('commentId') commentId: string) {
    return this.postsService.deleteComment(commentId);
  }

  /**
   * Get post count
   */
  @Get('count/all')
  async getPostCount(@Query('organizationId') organizationId: string) {
    return { count: await this.postsService.getPostCount(organizationId) };
  }
}
