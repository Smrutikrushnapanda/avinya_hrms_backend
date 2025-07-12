import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
      <div style="
        min-height: 80vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: sans-serif;
      ">
        <h1 style="margin-bottom: 1rem; color: #184a8c;">
          Welcome to 
          <span style="background: linear-gradient(to right, #184a8c, #00b4db); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            Avinya HRMS
          </span> Portal API
        </h1>
        <a href="/docs" style="
          display: inline-block;
          padding: 10px 24px;
          background: #184a8c;
          color: #fff;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
          box-shadow: 0 2px 6px #184a8c22;
        ">
          View API Documentation
        </a>
      </div>
    `;
  }
}
