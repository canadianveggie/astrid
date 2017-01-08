# ASTRID - Analytic System Tracking Rapid Infant Development

A charting and visualization webapp that takes exported [Feed Baby](https://www.facebook.com/FeedBaby/) data and makes it easier to understand.

## Getting Started

This projected is designed to be easily forked to include your own baby's data. The master branch is just code. All of the data lives on the [gh-pages branch](https://github.com/canadianveggie/astrid/tree/gh-pages) in the _data directory. 

### Hosting on Github Pages

ASTRID is designed to be hosted on [Github Pages](https://pages.github.com/), which uses Jekyll as its web engine.

Just go to Settings -> Github Pages

and choose the gh-pages branch as the Source.

### Running locally

If you want to run ASTRID locally, you will need [node.js](https://nodejs.org/) and [Ruby](https://www.ruby-lang.org/en/downloads/) 2.1 or higher installed.

The Gemfile contains local Jekyll dependencies. Use bundle to install them.

```
bundle install
```

The package.json file includes developer tools (like grunt). Use npm to install them.

```
npm install
```

To start the local webserver:
```
npm start
```

Then open http://127.0.0.1:4000/ in your browser.

## Adding your own data

To update your Feed Baby data, export the latest zipfile of CSV data and extract it into the _data directory.

Other data that can be specified includes:

Metadata in [baby.yml](/_data/baby.yml)
```
name:
gender:  # male or female
birthdate: # format YYYY-MM-DD
picture_url:
```

Milestones in [milestones.csv](/_data/milestones.csv) (which will create a photo carousel)
```
date,title,description,photo
```

### Adding new features

3rd party javascript libraries can easily be added with [bower](https://bower.io/). Because of how Jekyll works, the main files will needed to be checked into the [vendor](/vendor) directory. Grunt will automatically install the bower components and copy the main files into vendor. For example:

```
bower install underscore --save
grunt
git add vendor/underscore
```
