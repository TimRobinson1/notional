<img src="https://assets.dryicons.com/uploads/icon/svg/2031/security.svg" title="Notional" alt="Notional" width="100px">

# Notional

> An unofficial Notion API for interacting with table data in NodeJS

_Notional: Existing as or based on a suggestion, estimate, or theory_ -- <a href="https://dictionary.cambridge.org/dictionary/english/notional">Cambridge Dictionary</a>

---

## Basic Usage

### Installation
```
npm i notional

yarn add notional
```

### Getting setup
To use `notional`, you'll need both an API key and your user ID. To acquire these, follow these steps:
- Using a browser (Google Chrome in this example), visit a Notion webpage and make sure you're logged in.
- Open your developer tools and navigate to the `Application` tab.
- Under `Storage`, click on `Cookies` and then click on cookies from `https://www.notion.so`.
- Here you should find a cookie called `token_v2`. This value is your `apiKey`.
- You should also see `notion_user_id`, which you will need as your `userId`.

### Tables
Let's say we have a table in Notion to keep track of our video games:

<img src="https://i.ibb.co/JHtRPFQ/Screenshot-2020-06-09-at-2-45-09-am.png" />

#### Reading from the table
Nice. Let's connect to that table in our code using `notional`, and read from our table all of the Switch games that we have in our collection:

```javascript
import notional from 'notional';

// Let's just pretend that this is the URL of our table!
const TABLE_URL = 'https://www.notion.so/example/481ff7846d1a4f1c8f30e3a3911d9129';

const { table } = notional({
  apiKey: process.env.NOTION_API_KEY,
  userId: process.env.USER_ID,
});

async function readOutMyPCGames () {
  const videoGamesTable = await table(TABLE_URL);
  
  const pcGames = await videoGamesTable
    .where({ Platform: 'PC' })
    .get();

  console.log(pcGames);
}
```

If we were to run that `readOutMyPCGames` function, we'd end up with an output like so:

```json
[
  {
    "Title": "Resident Evil 2",
    "Platform": "PC",
    "Genres": ["action", "horror", "shooter"],
    "Finished": true,
    "Date purchased": {
      "type": "date",
      "start_date": "2020-03-19"
    }
  },
  {
    "Title": "Fallout 4",
    "Platform": "PC",
    "Genres": ["action", "shooter"],
    "Finished": false,
    "Date purchased": {
      "type": "date",
      "start_date": "2019-10-22"
    }
  },
  {
    "Title": "Skyrim",
    "Platform": "PC",
    "Genres": ["adventure"],
    "Finished": false,
    "Date purchased": {
      "type": "date",
      "start_date": "2017-11-09"
    }
  }
]
```

#### Updating the table
I finished _Super Mario Odyssey_ recently, but it looks like the table is out of date and says I haven't finished it! Let's correct that.

We can set up the `videoGamesTable` variable in the same way as before, and then all we have to do:

```javascript
await videoGamesTable
  .where({ Title: 'Super Mario Odyssey' })
  .update({ Finished: true });
```

#### Inserting into the table
I've just bought the video game _Dark Souls_ this exact second, let's add that to our table!

```javascript
await videoGamesTable.insertRows([
  {
    "Title": "Dark Souls",
    "Platform": "Xbox 360",
    "Genres": ["action", "adventure"],
    "Finished": false,
    "Date purchased": (new Date()).toISOString(),
  }
])
```

#### Deleting from the table
I don't think I'm going to be playing any more _Skyrim_ any time soon. In fact, let's just get rid of it and remove it from our table:

```javascript
await videoGamesTable
  .where({ Title: 'Skyrim' })
  .delete();
```
---