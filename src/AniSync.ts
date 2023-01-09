import API from "./API";
import StringSimilarity from "./libraries/StringSimilarity";
import { config } from "./config";
import Zoro from "./providers/anime/Zoro";
import CrunchyRoll from "./providers/anime/CrunchyRoll";
import AniList, { Media, Type } from "./providers/meta/AniList";
import { SearchResponse } from "./providers/anime/Anime";
import TMDB from "./providers/meta/TMDB";
import ComicK from "./providers/manga/ComicK";
import MangaDex from "./providers/manga/MangaDex";
import Mangakakalot from "./providers/manga/Mangakakalot";
import GogoAnime from "./providers/anime/GogoAnime";

export default class AniSync extends API {
    private stringSim:StringSimilarity = new StringSimilarity();
    constructor() {
        super();
    }

    // You want to search the database first, but since that hasn't been setup yet, we'll just search the providers.
    public async search(query:string, type:Type["ANIME"]|Type["MANGA"]): Promise<Result[]> {
        const promises = [];

        if (type === "ANIME") {
            const aniData:Media[] = [null];

            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const aniListPromise = new Promise((resolve, reject) => {
                aniList.search(query).then((result) => {
                    const data = result.data.Page.media;
                    aniData.push(...data);
                    resolve(aniData);
                });
            });
            promises.push(aniListPromise);
            await Promise.all(promises);

            // Search AniList first, then search the other providers.
            const possibleData = await this.searchAnimeData(aniData);
            if (possibleData.length > 0) {
                return possibleData;
            }
            
            const aggregatorData:AggregatorData[] = await this.fetchData(query, type);
            const comparison:Search[] = [];
            aggregatorData.map((result, index) => {
                const provider = result.provider_name;
                const results = result.results;

                for (let i = 0; i < results.length; i++) {
                    const data = this.compareAnime(results[i], aniData, config.mapping.provider[provider]?.threshold, config.mapping.provider[provider]?.comparison_threshold);
                    if (data != undefined) {
                        comparison.push({
                            provider,
                            data
                        });
                    }
                }
            });

            const result = this.formatData(comparison);
            return result;
        } else if (type === "MANGA") {
            const aniData:Media[] = [null];

            // Most likely will have to change MANGA to ONE_SHOT as well.
            const aniList = new AniList("", type, "MANGA");
            
            const aniListPromise = new Promise((resolve, reject) => {
                aniList.search(query).then((result) => {
                    const data = result.data.Page.media;
                    aniData.push(...data);
                    resolve(aniData);
                });
            });
            promises.push(aniListPromise);
            await Promise.all(promises);

            // Search AniList first, then search the other providers.
            const possibleData = await this.searchMangaData(aniData);
            if (possibleData.length > 0) {
                return possibleData;
            }
            
            const aggregatorData:AggregatorData[] = await this.fetchData(query, type);
            const comparison:Search[] = [];
            aggregatorData.map((result, index) => {
                const provider = result.provider_name;
                const results = result.results;

                for (let i = 0; i < results.length; i++) {
                    const data = this.compareAnime(results[i], aniData, config.mapping.provider[provider]?.threshold, config.mapping.provider[provider]?.comparison_threshold);
                    if (data != undefined) {
                        comparison.push({
                            provider,
                            data
                        });
                    }
                }
            });

            const result = this.formatData(comparison);
            return result;
        } else {
            throw new Error("Invalid type. Valid types include ANIME and MANGA.");
        }
    }

    public async crawl(type:Type["ANIME"]|Type["MANGA"], maxPages?:number, wait?:number) {
        maxPages = maxPages ? maxPages : config.crawling.anime.max_pages;
        wait = wait ? wait : config.crawling.anime.wait;

        if (type === "ANIME") {
            const aniList = new AniList("", type, "TV");
            const anime = new Zoro();

            for (let i = 0; i < maxPages; i++) {
                if (config.crawling.debug) {
                    console.log("On page " + i + ".");
                }

                const aniListData = await aniList.getSeasonal(i, 10, type);

                if (config.crawling.debug) {
                    console.log("Got AniList seasonal data successfully.");
                }

                const aniListMedia = aniListData.data.trending.media;
                
                const debugTimer = new Date(Date.now());
                if (config.crawling.debug) {
                    console.log("Fetching seasonal data...");
                }

                const data:Result[] = await this.getSeasonal(aniListMedia, type);

                if (config.crawling.debug) {
                    const endTimer = new Date(Date.now());
                    console.log("Finished fetching data. Request took " + (endTimer.getTime() - debugTimer.getTime()) + " milliseconds.");
                }

                await anime.insert(data);

                if (config.crawling.debug) {
                    console.log("Finished inserting shows.");
                }

                await this.wait(wait);
            }
        } else {
            const aniList = new AniList("", type, "MANGA");
            const manga = new ComicK();

            for (let i = 0; i < maxPages; i++) {
                if (config.crawling.debug) {
                    console.log("On page " + i + ".");
                }

                const aniListData = await aniList.getSeasonal(i, 10, type);

                if (config.crawling.debug) {
                    console.log("Got AniList seasonal data successfully.");
                }

                const aniListMedia = aniListData.data.trending.media;
                
                const debugTimer = new Date(Date.now());
                if (config.crawling.debug) {
                    console.log("Fetching seasonal data...");
                }

                const data:Result[] = await this.getSeasonal(aniListMedia, type);

                if (config.crawling.debug) {
                    const endTimer = new Date(Date.now());
                    console.log("Finished fetching data. Request took " + (endTimer.getTime() - debugTimer.getTime()) + " milliseconds.");
                }

                await manga.insert(data);

                if (config.crawling.debug) {
                    console.log("Finished inserting shows.");
                }

                await this.wait(wait);
            }
        }
    }

    public async getTrending(type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        if (type === "ANIME") {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const data = await aniList.getSeasonal();
            const trending:Media[] = data.data.trending.media;

            const trendingData:Result[] = await this.getSeasonal(trending, type);
            return trendingData;
        } else {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "MANGA");
            
            const data = await aniList.getSeasonal();
            const trending:Media[] = data.data.trending.media;

            const trendingData:Result[] = await this.getSeasonal(trending, type);
            return trendingData;
        }
    }

    public async getSeason(type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        if (type === "ANIME") {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const data = await aniList.getSeasonal();
            const season:Media[] = data.data.season.media;

            const seasonData:Result[] = await this.getSeasonal(season, type);
            return seasonData;
        } else {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "MANGA");
            
            const data = await aniList.getSeasonal();
            const season:Media[] = data.data.season.media;

            const seasonData:Result[] = await this.getSeasonal(season, type);
            return seasonData;
        }
    }

    public async getPopular(type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        if (type === "ANIME") {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const data = await aniList.getSeasonal();
            const popular:Media[] = data.data.popular.media;

            const popularData:Result[] = await this.getSeasonal(popular, type);
            return popularData;
        } else {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "MANGA");
            
            const data = await aniList.getSeasonal();
            const popular:Media[] = data.data.popular.media;

            const popularData:Result[] = await this.getSeasonal(popular, type);
            return popularData;
        }
    }

    public async getTop(type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        if (type === "ANIME") {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const data = await aniList.getSeasonal();
            const top:Media[] = data.data.top.media;

            const topData:Result[] = await this.getSeasonal(top, type);
            return topData;
        } else {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "MANGA");
            
            const data = await aniList.getSeasonal();
            const top:Media[] = data.data.top.media;

            const topData:Result[] = await this.getSeasonal(top, type);
            return topData;
        }
    }

    public async getNextSeason(type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        // WILL MOST LIKELY HAVE NO RESULTS
        if (type === "ANIME") {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "TV");
            
            const data = await aniList.getSeasonal();
            const nextSeason:Media[] = data.data.nextSeason.media;

            const nextData:Result[] = await this.getSeasonal(nextSeason, type);
            return nextData;
        } else {
            // Most likely will have to change TV to MOVIE, OVA, etc.
            const aniList = new AniList("", type, "MANGA");
            
            const data = await aniList.getSeasonal();
            const nextSeason:Media[] = data.data.nextSeason.media;

            const nextData:Result[] = await this.getSeasonal(nextSeason, type);
            return nextData;
        }
    }

    private async getSeasonal(season:Media[], type:Type["ANIME"]|Type["MANGA"]):Promise<Result[]> {
        if (type === "ANIME") {
            const seasonData:Search[] = [];
            const allSeason:Result[] = [];

            const possibleTrending = await this.searchAnimeData(season);
            if (possibleTrending.length > 0) {
                allSeason.push(...possibleTrending);
            } else {
                for (let i = 0; i < season.length; i++) {
                    const aniData = season[i];
                    const title = aniData.title.english;
    
                    const aggregatorData:AggregatorData[] = await this.fetchData(title, type);
    
                    aggregatorData.map((result, index) => {
                        const provider = result.provider_name;
                        const results = result.results;
    
                        for (let i = 0; i < results.length; i++) {
                            const data = this.compareAnime(results[i], [aniData], config.mapping.provider[provider]?.threshold, config.mapping.provider[provider]?.comparison_threshold);
                            if (data != undefined) {
                                seasonData.push({
                                    provider,
                                    data
                                });
                            }
                        }
                    });
                }
                const formatted = this.formatData(seasonData);
                allSeason.push(...formatted);
            }
            return allSeason;
        } else {
            const seasonData:Search[] = [];
            const allSeason:Result[] = [];

            const possibleTrending = await this.searchMangaData(season);
            if (possibleTrending.length > 0) {
                allSeason.push(...possibleTrending);
            } else {
                for (let i = 0; i < season.length; i++) {
                    const aniData = season[i];
                    const title = aniData.title.english;
    
                    const aggregatorData:AggregatorData[] = await this.fetchData(title, type);
    
                    aggregatorData.map((result, index) => {
                        const provider = result.provider_name;
                        const results = result.results;
    
                        for (let i = 0; i < results.length; i++) {
                            const data = this.compareAnime(results[i], [aniData], config.mapping.provider[provider]?.threshold, config.mapping.provider[provider]?.comparison_threshold);
                            if (data != undefined) {
                                seasonData.push({
                                    provider,
                                    data
                                });
                            }
                        }
                    });
                }
                const formatted = this.formatData(seasonData);
                allSeason.push(...formatted);
            }
            return allSeason;
        }
    }

    private async fetchData(query:string, type:Type["ANIME"]|Type["MANGA"]):Promise<AggregatorData[]> {
        const promises = [];
        if (type === "ANIME") {
            const zoro = new Zoro();
            const crunchy = new CrunchyRoll();
            const tmdb = new TMDB();
            const gogoanime = new GogoAnime();
            const aggregatorData:AggregatorData[] = [];

            const zoroPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[zoro.providerName] ? config.mapping.provider[zoro.providerName].wait : config.mapping.wait).then(() => {
                    zoro.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: zoro.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });
            const crunchyPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[crunchy.providerName] ? config.mapping.provider[crunchy.providerName].wait : config.mapping.wait).then(() => {
                    crunchy.init().then(() => {
                        crunchy.search(query).then((results) => {
                            aggregatorData.push({
                                provider_name: crunchy.providerName,
                                results: results
                            });
                            resolve(aggregatorData);
                        }).catch((err) => {
                            reject(err);
                        });
                    })
                });
            });
            const gogoPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[gogoanime.providerName] ? config.mapping.provider[gogoanime.providerName].wait : config.mapping.wait).then(() => {
                    gogoanime.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: gogoanime.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });
            const tmdbPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[tmdb.providerName] ? config.mapping.provider[tmdb.providerName].wait : config.mapping.wait).then(() => {
                    tmdb.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: tmdb.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });

            promises.push(zoroPromise);
            promises.push(crunchyPromise);
            promises.push(tmdbPromise);
            await Promise.all(promises);
            return aggregatorData;
        } else if (type === "MANGA") {
            const comick = new ComicK();
            const mangadex = new MangaDex();
            const mangakakalot = new Mangakakalot();
            const aggregatorData:AggregatorData[] = [];

            const comickPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[comick.providerName] ? config.mapping.provider[comick.providerName].wait : config.mapping.wait).then(() => {
                    comick.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: comick.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });
            const mangadexPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[mangadex.providerName] ? config.mapping.provider[mangadex.providerName].wait : config.mapping.wait).then(() => {
                    mangadex.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: mangadex.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });
            const mangakakalotPromise = new Promise((resolve, reject) => {
                this.wait(config.mapping.provider[mangakakalot.providerName] ? config.mapping.provider[mangakakalot.providerName].wait : config.mapping.wait).then(() => {
                    mangakakalot.search(query).then((results) => {
                        aggregatorData.push({
                            provider_name: mangakakalot.providerName,
                            results: results
                        });
                        resolve(aggregatorData);
                    }).catch((err) => {
                        reject(err);
                    });
                });
            });

            promises.push(comickPromise);
            promises.push(mangadexPromise);
            promises.push(mangakakalotPromise);
            await Promise.all(promises);
            return aggregatorData;
        } else {
            throw new Error("Invalid type. Valid types include ANIME and MANGA.");
        }
    }

    // Formats search results into singular AniList data. Assigns each provider to an AniList object.
    private formatData(results:Search[]):Result[] {
        const aniList = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const provider = result.provider;
            const data = result.data;

            let media:any = data.media;
            let canPush = true;
            let index = -1;

            for (let j = 0; j < aniList.length; j++) {
                if (aniList[j].id === media.id) {
                    canPush = false;
                    media = aniList[j];
                    index = j;
                }
            }
            if (canPush) {
                aniList.push({
                    id: media.id,
                    anilist: media,
                    connectors: [{ provider: provider, data: result.data.result, comparison: result.data.comparison }]
                });
            } else {
                const aniListData = media.anilist;
                const formatted = {
                    id: media.id,
                    anilist: aniListData,
                    connectors: [...aniList[index].connectors, { provider: provider, data: result.data.result, comparison: result.data.comparison }]
                }
                aniList[index] = formatted;
            }
        }

        return aniList;
    }

    private checkItem(result1:Mapping, result2:Mapping, threshold:number):number {
        let amount = 0;
        let tries = 0;

        result1.title = result1.title != undefined ? result1.title.toLowerCase() : undefined;
        result1.romaji = result1.romaji != undefined ? result1.romaji.toLowerCase() : undefined;
        result1.native = result1.native != undefined ? result1.native.toLowerCase() : undefined;

        result2.title = result2.title != undefined ? result2.title.toLowerCase() : undefined;
        result2.romaji = result2.romaji != undefined ? result2.romaji.toLowerCase() : undefined;
        result2.native = result2.native != undefined ? result2.native.toLowerCase() : undefined;

        // Check title
        if (result1.title != undefined && result2.title != undefined) {
            tries++;
            const stringComparison = this.stringSim.compareTwoStrings(result1.title, result2.title);
            if (result1.title === result2.title || stringComparison > threshold) {
                amount++;
            }
        }

        if (result1.romaji != undefined && result2.romaji != undefined) {
            tries++;
            const stringComparison = this.stringSim.compareTwoStrings(result1.romaji, result2.romaji);
            if (result1.romaji === result2.romaji || stringComparison > threshold) {
                amount++;
            }
        }

        if (result1.native != undefined && result2.native != undefined) {
            tries++;
            const stringComparison = this.stringSim.compareTwoStrings(result1.native, result2.native);
            if (result1.native === result2.native || stringComparison > threshold) {
                amount++;
            }
        }
        return amount / tries;
    }

    private compareAnime(anime:SearchResponse, aniList:[Media]|Media[], threshold:number, comparison_threshold:number):ComparisonData {
        threshold = threshold ? threshold : config.mapping.threshold;
        comparison_threshold = comparison_threshold ? comparison_threshold : config.mapping.comparison_threshold;
        
        const result:ComparisonData[] = [];
        for (let i = 0; i < aniList.length; i++) {
            const media:Media = aniList[i];

            if (!media) {
                continue;
            }

            const map1:Mapping = {
                title: anime.title,
                romaji: anime.romaji,
                native: anime.native
            };
            const map2:Mapping = {
                title: media.title.english,
                romaji: media.title.romaji,
                native: media.title.native
            }

            const comparison = this.checkItem(map1, map2, threshold);
            if (comparison > comparison_threshold) {
                result.push({
                    result: anime,
                    media,
                    comparison
                })
            }
        }
        // It is possible that there are multiple results, so we need to sort them. But generally, there should only be one result.
        return result[0];
    }

    private async searchAnimeData(aniListData:Media[]):Promise<Result[]> {
        const promises = [];
        const results:Result[] = [];

        const anime = new Zoro();

        for (let i = 0; i < aniListData.length; i++) {
            const id = aniListData[i] ? aniListData[i].id : undefined;
            if (id != undefined) {
                const promise = new Promise(async(resolve, reject) => {
                    const data = await anime.get(String(id));
                    if (data != null) {
                        results.push(data);
                    }
                    resolve(true);
                })
                promises.push(promise);
            }
        }

        await Promise.all(promises);
        return results;
    }

    private async searchMangaData(aniListData:Media[]):Promise<Result[]> {
        const promises = [];
        const results:Result[] = [];

        const manga = new ComicK();

        for (let i = 0; i < aniListData.length; i++) {
            const id = aniListData[i] ? aniListData[i].id : undefined;
            if (id != undefined) {
                const promise = new Promise(async(resolve, reject) => {
                    const data = await manga.get(String(id));
                    if (data != null) {
                        results.push(data);
                    }
                    resolve(true);
                })
                promises.push(promise);
            }
        }

        await Promise.all(promises);
        return results;
    }
}

interface Search {
    provider: string;
    data: ComparisonData;
}

interface Result {
    id: number;
    anilist: Media;
    connectors: [
        {
            provider: string;
            data: SearchResponse;
            comparison: number;
        }
    ];
}

interface ComparisonData {
    result: SearchResponse;
    media: Media;
    comparison: number;
}

interface AggregatorData {
    provider_name: string;
    results: SearchResponse[]
}

interface Mapping {
    title?: string;
    romaji?: string;
    native?: string;
    genres?: string[];
}

export type { Result };